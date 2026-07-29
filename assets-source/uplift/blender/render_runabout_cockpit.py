"""Deterministic transparent pilot-eye render for cockpit loading fallbacks.

Run with:
    blender --background --python render_runabout_cockpit.py

The hero GLB remains authoritative. This driver imports its procedural source,
poses the otherwise independent moving roots like the runtime, hides exterior
transition hardware, and renders a clean cabin silhouette with no world plate.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# Importing executes the normal deterministic builder and leaves its scene live.
import runabout_cockpit  # noqa: E402,F401

OUTPUT = os.path.abspath(os.path.join(
    HERE, "..", "renders", "runabout-cockpit-pilot-eye.png"
))
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)


def descendants(root):
    yield root
    for child in root.children:
        yield from descendants(child)


def hide_asset(name):
    root = bpy.data.objects.get(name)
    if root is None:
        return
    for obj in descendants(root):
        obj.hide_render = True


def pose_asset(name, location=(0.0, 0.0, 0.0), scale=1.0):
    root = bpy.data.objects.get(name)
    if root is None:
        return
    root.location = location
    root.scale = (scale, scale, scale)


def aim(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def area_light(name, location, target, color, energy, size):
    data = bpy.data.lights.new(name, "AREA")
    data.color = color
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


# Exterior boarding hardware has no place in a first-person loading plate.
for asset in (
    "airlock-door", "boarding-ramp", "landing-gear-port",
    "landing-gear-starboard", "landing-gear-nose", "canopy-glass",
):
    hide_asset(asset)

# Match the static runtime offsets. Controls are tucked just below the display
# line so the silhouette reads without obscuring the blank fallback screens.
pose_asset("cockpit-shell", (0.0, 0.0, -0.105))
pose_asset("dashboard", (0.0, 0.0, -0.065))
pose_asset("cockpit-lights", (0.0, 0.0, -0.065))
for display in ("display-primary", "display-nav", "display-systems"):
    pose_asset(display, (0.0, 0.0, -0.065))
pose_asset("flight-stick", (-0.075, -0.310, -0.255), 0.48)
pose_asset("throttle-lever", (0.210, -0.325, -0.145), 0.52)
pose_asset("brake-lever", (0.155, -0.332, -0.150), 0.50)
pose_asset("trim-wheel", (-0.205, -0.340, -0.140), 0.58)
pose_asset("autopilot-rocker", (-0.238, -0.455, -0.128), 0.72)
pose_asset("pedal-port", (0.125, -0.475, -0.370), 0.80)
pose_asset("pedal-starboard", (-0.125, -0.475, -0.370), 0.80)

# Blank powered screens: enough cyan to identify the dash during loading, no
# fake numbers that could contradict the live CanvasTexture instruments.
screen_mat = bpy.data.materials.new("fallback-screen")
screen_mat.use_nodes = True
screen_bsdf = screen_mat.node_tree.nodes.get("Principled BSDF")
screen_bsdf.inputs["Base Color"].default_value = (0.002, 0.018, 0.022, 1.0)
screen_bsdf.inputs["Roughness"].default_value = 0.28
if "Emission Color" in screen_bsdf.inputs:
    screen_bsdf.inputs["Emission Color"].default_value = (0.005, 0.11, 0.13, 1.0)
    screen_bsdf.inputs["Emission Strength"].default_value = 0.16
for asset in ("display-primary", "display-nav", "display-systems"):
    root = bpy.data.objects.get(asset)
    if root:
        for obj in descendants(root):
            if obj.type == "MESH":
                obj.data.materials.clear()
                obj.data.materials.append(screen_mat)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 2048
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.filepath = OUTPUT
scene.render.use_file_extension = True

# A very wide pilot camera mirrors the game's first-person composition.
camera_data = bpy.data.cameras.new("pilot-eye-camera")
camera_data.lens = 18.0
camera_data.sensor_width = 36.0
camera_data.clip_start = 0.012
camera_data.clip_end = 20.0
camera = bpy.data.objects.new("pilot-eye-camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (0.0, 0.035, 0.035)
aim(camera, (0.0, -1.0, 0.055))
scene.camera = camera

# Neutral canopy key plus short-reach instrument bounce. All values are fixed;
# EEVEE avoids sampling noise and keeps this render byte-stable per Blender.
area_light(
    "fallback-canopy-key", (0.0, 0.16, 0.48), (0.0, -0.42, -0.08),
    (0.28, 0.36, 0.48), 34.0, 0.55,
)
area_light(
    "fallback-cyan-bounce", (-0.24, -0.10, 0.02), (0.0, -0.42, -0.10),
    (0.08, 0.55, 0.66), 7.0, 0.30,
)
area_light(
    "fallback-warm-bounce", (0.29, -0.02, -0.02), (0.08, -0.38, -0.12),
    (0.72, 0.30, 0.10), 4.0, 0.24,
)

if scene.world is None:
    scene.world = bpy.data.worlds.new("fallback-world")
scene.world.color = (0.002, 0.003, 0.006)
scene.view_settings.exposure = -1.15
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

bpy.ops.render.render(write_still=True)
print(f"wrote transparent cockpit fallback: {OUTPUT}")