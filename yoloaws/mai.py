"""
Town Planning AR System — Main Entry Point

Runs YOLO object detection on a webcam feed, evaluates urban planning
layout in real-time using the spatial engine, and serves results via
a Flask API for the Next.js dashboard.

Usage:
    python mai.py                   # default camera index 1
    python mai.py --camera 0        # laptop camera
    python mai.py --camera 1        # external camera
"""

import cv2
import math
import json
import argparse
import itertools
import threading
import time
import os
import sys
import base64
import numpy as np

from ultralytics import YOLO

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from spatial_engine import load_registry, evaluate_layout
from scenario_manager import save_snapshot, list_snapshots, load_snapshot, compare_snapshots, delete_snapshot

# ================= CONFIGURATION =================
MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "runs",
    "detect",
    "runs",
    "detect",
    "town_planning_final_run4",
    "weights",
    "best.pt"
)
# CALIBRATION: Measure how many pixels = 1 cm on your camera feed at the fixed height
PIXELS_PER_CM = 20

# Confidence Threshold
CONF_THRESHOLD = 0.40

# Frame dimensions
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720

# Flask API port
API_PORT = 5000
# =================================================

# Shared state (thread-safe via GIL for simple reads/writes)
_current_state = {
    "objects": [],
    "evaluation": None,
    "frame_size": {"width": FRAME_WIDTH, "height": FRAME_HEIGHT},
    "timestamp": None,
    "is_running": False,
}
_state_lock = threading.Lock()
_model = None  # Will be set in main() so Flask endpoints can use it


def _update_state(objects, evaluation):
    """Thread-safe state update."""
    with _state_lock:
        _current_state["objects"] = [
            {
                "name": obj["name"],
                "center": list(obj["center"]),
                "box": list(obj["box"]),
            }
            for obj in objects
        ]
        _current_state["evaluation"] = evaluation
        _current_state["timestamp"] = time.time()
        _current_state["is_running"] = True


def _get_state():
    """Thread-safe state read."""
    with _state_lock:
        return json.loads(json.dumps(_current_state))


# ---------------------------------------------------------------------------
# Flask API Server
# ---------------------------------------------------------------------------

def start_api_server():
    """Start the Flask API in a background thread."""
    try:
        from flask import Flask, jsonify, request
        from flask_cors import CORS
    except ImportError:
        print("⚠️  Flask not installed. Run: pip install flask flask-cors")
        print("   Dashboard API will not be available.")
        return

    app = Flask(__name__)
    CORS(app)

    @app.route("/api/state", methods=["GET"])
    def get_state():
        """Return the current detection + evaluation state."""
        return jsonify(_get_state())

    @app.route("/api/registry", methods=["GET"])
    def get_registry():
        """Return the block registry configuration."""
        registry = load_registry()
        return jsonify(registry)

    @app.route("/api/snapshot", methods=["POST"])
    def save_snap():
        """Save the current layout as a snapshot."""
        state = _get_state()
        name = None
        if request.is_json:
            name = request.json.get("name")
        
        objects = state.get("objects", [])
        evaluation = state.get("evaluation", {})
        
        if not objects:
            return jsonify({"error": "No objects detected to save"}), 400
        
        filename = save_snapshot(objects, evaluation, name)
        return jsonify({"filename": filename, "message": "Snapshot saved"})

    @app.route("/api/snapshots", methods=["GET"])
    def get_snapshots():
        """List all saved snapshots."""
        return jsonify(list_snapshots())

    @app.route("/api/snapshot/<filename>", methods=["GET"])
    def get_snapshot(filename):
        """Load a specific snapshot."""
        snap = load_snapshot(filename)
        if snap is None:
            return jsonify({"error": "Snapshot not found"}), 404
        return jsonify(snap)

    @app.route("/api/snapshot/<filename>", methods=["DELETE"])
    def del_snapshot(filename):
        """Delete a snapshot."""
        if delete_snapshot(filename):
            return jsonify({"message": "Deleted"})
        return jsonify({"error": "Not found"}), 404

    @app.route("/api/compare", methods=["POST"])
    def compare_snaps():
        """Compare two snapshots."""
        data = request.get_json()
        if not data or "a" not in data or "b" not in data:
            return jsonify({"error": "Provide 'a' and 'b' filenames"}), 400
        
        result = compare_snapshots(data["a"], data["b"])
        if result is None:
            return jsonify({"error": "One or both snapshots not found"}), 404
        return jsonify(result)

    @app.route("/api/detect", methods=["POST"])
    def detect_image():
        """Run YOLO detection on an uploaded image."""
        if _model is None:
            return jsonify({"error": "Model not loaded yet"}), 503

        if "image" not in request.files:
            return jsonify({"error": "No image file provided"}), 400

        file = request.files["image"]
        file_bytes = file.read()
        nparr = np.frombuffer(file_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"error": "Could not decode image"}), 400

        h, w = frame.shape[:2]
        registry = load_registry()
        buildings_meta = registry.get("buildings", {})

        # Run YOLO
        results = _model.predict(frame, conf=CONF_THRESHOLD, verbose=False)[0]

        detected_objects = []
        for box in results.boxes:
            cls_id = int(box.cls[0])
            cls_name = _model.names[cls_id]
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            detected_objects.append({
                "name": cls_name,
                "center": (cx, cy),
                "box": (x1, y1, x2, y2),
            })

        # Run spatial evaluation
        eval_result = None
        if detected_objects:
            eval_result = evaluate_layout(
                detected_objects, registry, PIXELS_PER_CM, w, h
            )

        # Draw overlays on the frame for annotated image
        for obj in detected_objects:
            meta = buildings_meta.get(obj["name"])
            draw_detection_overlay(frame, obj, meta, registry)
        draw_coverage_circles(frame, detected_objects, registry)
        draw_distances(frame, detected_objects)
        if eval_result:
            draw_violation_lines(frame, detected_objects, eval_result.get("violations", []), registry)
        draw_score_hud(frame, eval_result)

        # Encode annotated frame as base64 JPEG
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        img_b64 = base64.b64encode(buffer).decode("utf-8")

        # Serialize objects for JSON
        objects_json = [
            {
                "name": obj["name"],
                "center": list(obj["center"]),
                "box": list(obj["box"]),
            }
            for obj in detected_objects
        ]

        return jsonify({
            "objects": objects_json,
            "evaluation": eval_result,
            "frame_size": {"width": w, "height": h},
            "annotated_image": f"data:image/jpeg;base64,{img_b64}",
            "timestamp": time.time(),
        })

    @app.route("/api/camera/status", methods=["GET"])
    def camera_status():
        """Check if the camera loop is actively sending frames."""
        state = _get_state()
        return jsonify({
            "is_running": state.get("is_running", False),
            "has_objects": len(state.get("objects", [])) > 0,
            "timestamp": state.get("timestamp"),
        })

    @app.route("/api/health", methods=["GET"])
    def health():
        """Health check endpoint."""
        return jsonify({"status": "ok", "timestamp": time.time()})

    # Run in a daemon thread so it dies with the main process
    thread = threading.Thread(
        target=lambda: app.run(host="0.0.0.0", port=API_PORT, debug=False, use_reloader=False),
        daemon=True,
    )
    thread.start()
    print(f"🌐 API server started at http://localhost:{API_PORT}")


# ---------------------------------------------------------------------------
# Drawing Helpers
# ---------------------------------------------------------------------------

def draw_detection_overlay(frame, obj, meta, registry):
    """Draw enhanced bounding box + label with building color."""
    x1, y1, x2, y2 = obj["box"]
    cx, cy = obj["center"]

    # Use building color from registry or default green
    color_hex = meta.get("color", "#00FF00") if meta else "#00FF00"
    color_bgr = hex_to_bgr(color_hex)

    # Draw box with building color
    cv2.rectangle(frame, (x1, y1), (x2, y2), color_bgr, 2)

    # Label with zone info
    zone = meta.get("zone", "unknown") if meta else "unknown"
    display = meta.get("display_name", obj["name"]) if meta else obj["name"]
    label = f"{display} [{zone}]"

    # Label background
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.5
    thickness = 1
    (tw, th), _ = cv2.getTextSize(label, font, scale, thickness)
    cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 10, y1), color_bgr, -1)
    cv2.putText(frame, label, (x1 + 5, y1 - 5), font, scale, (255, 255, 255), thickness)

    # Center dot
    cv2.circle(frame, (cx, cy), 4, (255, 255, 255), -1)
    cv2.circle(frame, (cx, cy), 4, color_bgr, 1)


def draw_violation_lines(frame, objects, violations, registry):
    """Draw red dashed lines between buildings with zoning violations."""
    name_to_obj = {}
    for obj in objects:
        key = obj["name"]
        if key not in name_to_obj:
            name_to_obj[key] = []
        name_to_obj[key].append(obj)

    for v in violations:
        objs_a = name_to_obj.get(v["building_a"], [])
        objs_b = name_to_obj.get(v["building_b"], [])

        for oa in objs_a:
            for ob in objs_b:
                dist_px = math.sqrt(
                    (ob["center"][0] - oa["center"][0]) ** 2
                    + (ob["center"][1] - oa["center"][1]) ** 2
                )
                dist_cm = dist_px / PIXELS_PER_CM
                if abs(dist_cm - v["distance_cm"]) < 2.0:
                    # Red line for violation
                    color = (0, 0, 255) if v["severity"] == "critical" else (0, 140, 255)
                    cv2.line(frame, oa["center"], ob["center"], color, 2)

                    mid_x = (oa["center"][0] + ob["center"][0]) // 2
                    mid_y = (oa["center"][1] + ob["center"][1]) // 2
                    cv2.putText(
                        frame, "VIOLATION", (mid_x - 30, mid_y - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1
                    )


def draw_coverage_circles(frame, objects, registry):
    """Draw coverage radius circles for utility buildings."""
    buildings = registry.get("buildings", {})
    for obj in objects:
        meta = buildings.get(obj["name"])
        if meta and meta.get("coverage_radius_cm", 0) > 0:
            radius_px = int(meta["coverage_radius_cm"] * PIXELS_PER_CM)
            color = hex_to_bgr(meta.get("color", "#3498DB"))
            # Semi-transparent circle
            overlay = frame.copy()
            cv2.circle(overlay, obj["center"], radius_px, color, 2)
            cv2.circle(overlay, obj["center"], radius_px, (*color[:2], color[2]), 1)
            cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, frame)
            # Border circle
            cv2.circle(frame, obj["center"], radius_px, color, 1)


def draw_score_hud(frame, evaluation):
    """Draw a small HUD with the overall score in the top-right corner."""
    if not evaluation:
        return

    overall = evaluation.get("overall", {})
    score = overall.get("overall", 0)
    grade = overall.get("grade", "?")

    # Background panel
    h, w = frame.shape[:2]
    panel_w, panel_h = 180, 90
    x1, y1 = w - panel_w - 10, 10

    overlay = frame.copy()
    cv2.rectangle(overlay, (x1, y1), (x1 + panel_w, y1 + panel_h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    # Grade color
    grade_colors = {"A": (0, 200, 0), "B": (0, 200, 200), "C": (0, 165, 255), "D": (0, 100, 255), "F": (0, 0, 255)}
    grade_color = grade_colors.get(grade, (255, 255, 255))

    cv2.putText(frame, f"Score: {score:.0f}/100", (x1 + 10, y1 + 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"Grade: {grade}", (x1 + 10, y1 + 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, grade_color, 2)

    # Violation count
    violations = evaluation.get("violations", [])
    v_color = (0, 0, 255) if violations else (0, 200, 0)
    cv2.putText(frame, f"Violations: {len(violations)}", (x1 + 10, y1 + 82),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, v_color, 1)


def draw_distances(frame, objects):
    """Draw distance lines between all pairs (original functionality)."""
    pairs = list(itertools.combinations(objects, 2))
    for obj_a, obj_b in pairs:
        pt1 = obj_a["center"]
        pt2 = obj_b["center"]

        dist_px = math.sqrt((pt2[0] - pt1[0]) ** 2 + (pt2[1] - pt1[1]) ** 2)
        dist_cm = dist_px / PIXELS_PER_CM

        # Draw line (thin, subtle)
        cv2.line(frame, pt1, pt2, (200, 200, 200), 1)

        # Midpoint label
        mid_x = (pt1[0] + pt2[0]) // 2
        mid_y = (pt1[1] + pt2[1]) // 2

        label = f"{dist_cm:.1f}cm"
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = 0.4
        thickness = 1
        (tw, th), _ = cv2.getTextSize(label, font, scale, thickness)
        cv2.rectangle(frame, (mid_x - 2, mid_y - th - 2), (mid_x + tw + 2, mid_y + 2), (40, 40, 40), -1)
        cv2.putText(frame, label, (mid_x, mid_y), font, scale, (200, 200, 200), thickness)


def hex_to_bgr(hex_color: str) -> tuple:
    """Convert hex color string to BGR tuple."""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return (b, g, r)


# ---------------------------------------------------------------------------
# Main Loop
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Town Planning AR System")
    parser.add_argument("--camera", type=int, default=1, help="Camera index (default: 1)")
    parser.add_argument("--no-api", action="store_true", help="Disable Flask API server")
    parser.add_argument("--headless", action="store_true", help="Run without OpenCV GUI window")
    args = parser.parse_args()

    # Detect if GUI is available
    gui_available = not args.headless
    if gui_available:
        try:
            # Test if highgui is functional
            cv2.namedWindow("__test__", cv2.WINDOW_NORMAL)
            cv2.destroyWindow("__test__")
        except cv2.error:
            print("⚠️  OpenCV GUI not available (headless build). Running in headless mode.")
            print("   The dashboard at http://localhost:3000 will still work.")
            gui_available = False

    # Load registry
    registry = load_registry()
    buildings_meta = registry.get("buildings", {})
    print("📋 Block registry loaded:", ", ".join(buildings_meta.keys()))

    # Load model
    print("⏳ Loading YOLO model...")
    if not os.path.exists(MODEL_PATH):
        print(f"❌ Model not found at: {MODEL_PATH}")
        print("   Available models:")
        runs_dir = os.path.join(os.path.dirname(__file__), "runs", "detect")
        if os.path.exists(runs_dir):
            for root, dirs, files in os.walk(runs_dir):
                for f in files:
                    if f == "best.pt":
                        print(f"     {os.path.join(root, f)}")
        return

    model = YOLO(MODEL_PATH)
    global _model
    _model = model
    print("✅ Model loaded!")

    # Start Flask API
    if not args.no_api:
        start_api_server()

    # Open webcam
    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

    if not cap.isOpened():
        print(f"❌ Error: Could not open webcam (index {args.camera}).")
        print("   Try: python mai.py --camera 0")
        return

    if gui_available:
        print(f"🎥 Camera {args.camera} started. Press 'q' to quit, 's' to save snapshot.")
    else:
        print(f"🎥 Camera {args.camera} started (headless). Press Ctrl+C to quit.")

    frame_count = 0
    eval_result = None

    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Failed to grab frame.")
            break

        # 1. PREDICT
        results = model.predict(frame, conf=CONF_THRESHOLD, verbose=False)[0]

        # 2. EXTRACT OBJECTS
        detected_objects = []
        for box in results.boxes:
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            detected_objects.append({
                "name": cls_name,
                "center": (cx, cy),
                "box": (x1, y1, x2, y2),
            })

        # 3. SPATIAL EVALUATION (every 3rd frame for performance)
        if frame_count % 3 == 0 and detected_objects:
            eval_result = evaluate_layout(
                detected_objects, registry, PIXELS_PER_CM, FRAME_WIDTH, FRAME_HEIGHT
            )
            _update_state(detected_objects, eval_result)
        elif not detected_objects:
            eval_result = None
            _update_state([], None)

        # 4. DRAW OVERLAYS
        for obj in detected_objects:
            meta = buildings_meta.get(obj["name"])
            draw_detection_overlay(frame, obj, meta, registry)

        # Draw coverage circles for utilities
        draw_coverage_circles(frame, detected_objects, registry)

        # Draw distances (subtle)
        draw_distances(frame, detected_objects)

        # Draw violation lines
        if eval_result:
            draw_violation_lines(frame, detected_objects, eval_result.get("violations", []), registry)

        # Draw HUD
        draw_score_hud(frame, eval_result)

        # 5. SHOW FRAME (if GUI is available)
        if gui_available:
            try:
                cv2.imshow("Town Planning AR System", frame)
            except cv2.error:
                gui_available = False
                print("⚠️  OpenCV GUI failed. Switching to headless mode.")

        # Key handling
        if gui_available:
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("s"):
                if detected_objects and eval_result:
                    fname = save_snapshot(detected_objects, eval_result)
                    print(f"📸 Snapshot saved: {fname}")
                else:
                    print("⚠️  No objects detected — nothing to save.")
        else:
            # In headless mode, just throttle the loop slightly
            time.sleep(0.03)

        frame_count += 1

    # Cleanup
    cap.release()
    if gui_available:
        cv2.destroyAllWindows()
    print("👋 System closed.")


if __name__ == "__main__":
    main()