# PlanVision — Real-Time Spatial Planning Evaluation System

A computer vision system for real-time spatial planning analysis. Physical building blocks are arranged on a surface, detected via a custom-trained YOLOv8 model, and evaluated against spatial planning criteria — zoning compliance, utility coverage, connectivity, and density balance — all in real-time.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Custom YOLOv8 Model](#custom-yolov8-model)
  - [Dataset Preparation](#dataset-preparation)
  - [Labeling](#labeling)
  - [Training](#training)
  - [Model Performance](#model-performance)
- [Spatial Evaluation Engine](#spatial-evaluation-engine)
- [Block Registry](#block-registry)
- [Web Dashboard](#web-dashboard)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Setup and Installation](#setup-and-installation)
- [Usage](#usage)
- [Scoring Methodology](#scoring-methodology)
- [License](#license)

---

## Overview

PlanVision bridges physical model-building with computational planning analysis. Instead of working with CAD software or digital simulations, users arrange coloured blocks on a flat surface. An overhead camera captures the layout, a custom object detection model identifies each building type, and a spatial evaluation engine grades the layout across four independent planning axes.

The system provides two modes of operation:

- **Image Upload** — Upload a photograph of a block layout for one-shot analysis.
- **Live Camera** — Continuous real-time detection and evaluation at approximately 28 fps.

---

<img src="public/landing.png" alt="landing" width="900"/>
<img src="public/dash1.png" alt="landing" width="900"/>
<img src="public/dash2.png" alt="landing" width="900"/>

## Architecture

```
+----------------+    YOLOv8     +------------------+   Spatial    +--------------------+
|   Webcam /     | -----------> |  Object          | ----------> |  Evaluation        |
|   Uploaded     |              |  Detection       |             |  Engine            |
|   Image        |              |  (mai.py)        |             |  (spatial_engine)  |
+----------------+              +--------+---------+             +---------+----------+
                                         |                                 |
                                  OpenCV Window                     Flask API :5000
                                  (Annotated Feed)                         |
                                                                +----------+---------+
                                                                |  Next.js :3000     |
                                                                |  +---------------+ |
                                                                |  | Dashboard     | |
                                                                |  | Compare       | |
                                                                |  | Landing       | |
                                                                |  +---------------+ |
                                                                +--------------------+
```

---

## Custom YOLOv8 Model

### Dataset Preparation

The training dataset was built from scratch. Physical building blocks were arranged in various configurations on a flat surface under controlled lighting. Photographs were captured from a fixed overhead camera position at 1280x720 resolution.

Multiple sessions were conducted with varying:
- Block arrangements and spacing
- Lighting conditions (natural and artificial)
- Background surfaces
- Number of objects per frame (2 to 7 simultaneously)

### Labeling

All images were **manually annotated** using bounding box labels. Each object instance was labeled with one of seven class categories corresponding to building types in a town planning model:

| Class ID | Display Name | Description                        |
|----------|--------------|-------------------------------------|
| 0        | Depot        | Industrial storage facility         |
| 1        | Reservoir    | Water utility with coverage radius  |
| 2        | FreightDeck  | Logistics node, acts as road        |
| 3        | Harbor       | Port facility                       |
| 4        | Fortress     | Administrative residential center   |
| 5        | Residence    | Residential dwelling                |
| 6        | Factory      | Commercial manufacturing unit       |

Annotations were exported in YOLO format (normalized `class x_center y_center width height` per line) and organized into the standard `images/` and `labels/` directory structure.

### Training

The model was trained using the Ultralytics YOLOv8 framework. Key training parameters:


Training was executed across multiple runs with iterative refinement of the dataset (augmentation, re-labeling ambiguous samples, adding edge cases). The final production model is located at:

```
yolo backend/runs/detect/runs/detect/town_planning_final_run4/weights/best.pt
```

### Model Performance

The trained model operates at a confidence threshold of 0.40 in production. Detection is performed on every frame during live camera mode, and spatial evaluation is computed every third frame to balance responsiveness with computational load.

---

## Spatial Evaluation Engine

The evaluation engine (`spatial_engine.py`) runs four independent analyses on each detected layout:

### 1. Zoning Compliance (Weight: 30%)

Checks every pair of detected buildings against a zone compatibility matrix. Industrial buildings placed too close to residential zones trigger violations. Each building type defines a buffer zone radius, and the system flags violations when incompatible buildings are closer than the required buffer distance.

Severity levels:
- **Critical** — Distance is less than 50% of the required buffer
- **Warning** — Distance is less than the required buffer but above the critical threshold

### 2. Water Coverage (Weight: 25%)

Reservoirs cast a configurable service radius (default: 40 cm in model space). Every residential building that requires water coverage is checked against all reservoir radii. Uncovered buildings are flagged with specific suggestions for optimal reservoir placement.

### 3. Connectivity Graph (Weight: 25%)

Buildings are treated as nodes in an undirected graph. Two buildings are connected if they fall within a configurable proximity threshold (default: 30 cm). FreightDeck (loading platform) nodes receive a 1.5x connectivity radius bonus, acting as bridges between clusters. A Union-Find algorithm computes connected components, and the score reflects the percentage of buildings in the largest connected component.

### 4. Density Balance (Weight: 20%)

The frame is divided into four quadrants (NW, NE, SW, SE). Building counts per quadrant are compared against an ideal uniform distribution. Layouts concentrated in a single corner score poorly; evenly distributed layouts score high.

---

## Block Registry

All building metadata is defined in a single JSON configuration file (`block_registry.json`). Each entry specifies:

| Field                | Description                                          |
|----------------------|------------------------------------------------------|
| `display_name`       | Human-readable name shown in the dashboard           |
| `type`               | Functional category (storage, utility, logistics...) |
| `zone`               | Zoning classification (industrial, residential...)   |
| `color`              | Hex color used for bounding boxes and UI indicators  |
| `traffic_weight`     | Relative traffic generation factor (0.0 to 1.0)     |
| `buffer_zone_cm`     | Minimum separation from incompatible zones (cm)      |
| `coverage_radius_cm` | Service radius for utility buildings (cm)            |
| `needs_water_coverage` | Whether this building requires water utility access |
| `is_road`            | Whether this building acts as a connectivity bridge  |

The zone compatibility matrix defines which zone pairs are allowed to be adjacent.

---

## Web Dashboard

The frontend is built with Next.js 16, React 19, and TypeScript. It consists of three pages:

### Landing Page (`/`)
An architect's blueprint-style landing page with a live detection viewport mockup, animated score readouts, and section-by-section documentation of the system's capabilities.

### Dashboard (`/dashboard`)
Two input modes:
- **Upload Image** — Drag-and-drop or file picker. The image is sent to the backend, which returns an annotated image with bounding boxes, distance lines, violation markers, and a score HUD overlaid directly on the photograph, alongside full evaluation results.
- **Live Camera** — Polls the backend at 500ms intervals for real-time detection state. Displays detected buildings, score breakdowns, violations, suggestions, density heatmap, and scenario management controls.

### Compare (`/compare`)
Side-by-side comparison of two saved layout snapshots. Displays per-axis score deltas and declares a winner based on overall composite score.

---

## API Reference

All endpoints are served by the Flask backend on port 5000.

| Method   | Endpoint                  | Description                                      |
|----------|---------------------------|--------------------------------------------------|
| `GET`    | `/api/state`              | Current detection and evaluation state            |
| `GET`    | `/api/registry`           | Block registry configuration                     |
| `GET`    | `/api/health`             | Health check                                      |
| `POST`   | `/api/detect`             | Run detection on an uploaded image (multipart)    |
| `GET`    | `/api/camera/status`      | Camera feed status                                |
| `POST`   | `/api/snapshot`           | Save current layout (`{ "name": "..." }`)         |
| `GET`    | `/api/snapshots`          | List all saved snapshots                          |
| `GET`    | `/api/snapshot/:filename` | Load a specific snapshot                          |
| `DELETE` | `/api/snapshot/:filename` | Delete a snapshot                                 |
| `POST`   | `/api/compare`            | Compare two snapshots (`{ "a": "...", "b": "..." }`) |

---

## Project Structure

```
archi/
|-- app/                              Next.js frontend
|   |-- page.tsx                      Landing page
|   |-- layout.tsx                    Root layout with Geist fonts
|   |-- globals.css                   Design system (dark blueprint theme)
|   |-- dashboard/
|   |   +-- page.tsx                  Dashboard (upload + camera modes)
|   +-- compare/
|       +-- page.tsx                  Snapshot comparison view
|
|-- yolo backend/
|   |-- mai.py                        Main entry point (YOLO + Flask API)
|   |-- spatial_engine.py             Evaluation engine (zoning, coverage,
|   |                                 connectivity, density, scoring)
|   |-- scenario_manager.py           Snapshot save/load/compare/delete
|   |-- block_registry.json           Building metadata configuration
|   |-- data.yaml                     YOLO training data configuration
|   |-- snapshots/                    Saved layout snapshots (JSON)
|   +-- runs/detect/                  YOLO model weights
|
|-- public/                           Static assets
|-- package.json                      Dependencies and scripts
+-- README.md
```

---

## Setup and Installation

### Prerequisites

- Python 3.10 or later (CUDA-compatible GPU recommended)
- Node.js 18 or later
- Webcam (external recommended for overhead mounting)

### Backend

```bash
# Create and activate a conda environment
conda create -n townplan python=3.10
conda activate townplan

# Install Python dependencies
pip install ultralytics opencv-python flask flask-cors numpy

# Verify the model loads
cd "yolo backend"
python mai.py --camera 0
```

### Frontend

```bash
# Install Node.js dependencies
npm install

# Start both frontend and backend concurrently
npm run dev
```

This runs `next dev` and `python "yolo backend/mai.py"` in parallel via `concurrently`.

---

## Usage

### Image Upload Mode

1. Open `http://localhost:3000/dashboard` in a browser.
2. Select "Upload Image".
3. Drag and drop a photograph of your block layout, or click to browse.
4. The system returns an annotated image with detection overlays and full evaluation scores.

### Live Camera Mode

1. Ensure a webcam is connected and accessible.
2. Open `http://localhost:3000/dashboard` in a browser.
3. Select "Open Camera".
4. Arrange blocks on the surface within the camera's field of view.
5. Scores update in real-time as blocks are moved.
6. Press "Save Snapshot" to capture the current layout for later comparison.

### Keyboard Shortcuts (OpenCV Window)

If running with a GUI-capable OpenCV build:

| Key | Action                        |
|-----|-------------------------------|
| `S` | Save current layout snapshot  |
| `Q` | Quit the application          |

---

## Scoring Methodology

The overall layout score is a weighted composite ranging from 0 to 100:

| Metric             | Weight | Measurement                                        |
|--------------------|--------|----------------------------------------------------|
| Zoning Compliance  | 30%    | Penalty per zone violation, scaled by total pairs   |
| Water Coverage     | 25%    | Percentage of residential blocks within reservoir radius |
| Connectivity       | 25%    | Percentage of buildings in the largest connected component |
| Density Balance    | 20%    | Distribution evenness across four quadrants          |

### Grade Scale

| Grade | Score Range |
|-------|-------------|
| A     | 90 -- 100   |
| B     | 75 -- 89    |
| C     | 60 -- 74    |
| D     | 40 -- 59    |
| F     | Below 40    |

---

## License

Academic project — spatial planning analysis system.
Built at IIT Gandhinagar.
