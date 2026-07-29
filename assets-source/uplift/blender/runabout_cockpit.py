"""
The runabout's first-person interior and boarding hardware.

This is deliberately a multi-root kit. Static interior pieces are separate
from every control that moves so the runtime can merge each rigid part once,
then animate its object transform without a Blender rig:

    cockpit-shell        canopy-frame         canopy-glass
    dashboard            display-primary      display-nav
    display-systems      cockpit-lights
    flight-stick         throttle-lever       brake-lever
    trim-wheel           autopilot-rocker
    pedal-port           pedal-starboard
    airlock-door         boarding-ramp
    landing-gear-port    landing-gear-starboard  landing-gear-nose

The cockpit is authored around the pilot's eye at the Blender origin. Forward
is -Y and up is +Z, like every other vehicle kit. The GLB therefore arrives
+Z-forward and the R3F viewmodel rotates its geometry by PI to face camera
forward (-Z).

Transition pieces are authored at real human scale around their own hinge or
strut pivot. They are not parented under the cockpit shell because ground-side
call sites need to articulate them independently.
"""

import math
import os
import sys

# Blender does not put a --python script's own directory on the path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402
from mathutils import Matrix  # noqa: E402


# The exterior's working-ship palette, extended with interior rubber, screen
# glass and safety colours. Hex values are sRGB; kitlib converts to linear.
HULL = lambda: k.mat(0x111722, "cockpit-hull", 0.62, 0.52)          # noqa: E731
UPPER = lambda: k.mat(0x1D2634, "cockpit-upper", 0.56, 0.48)        # noqa: E731
PALE = lambda: k.mat(0x7C8798, "cockpit-replacement", 0.48, 0.42)   # noqa: E731
STEEL = lambda: k.mat(0x4D596B, "cockpit-steel", 0.42, 0.72)        # noqa: E731
DARK = lambda: k.mat(0x070B11, "cockpit-recess", 0.82, 0.18)        # noqa: E731
RUBBER = lambda: k.mat(0x090D14, "cockpit-rubber", 0.94, 0.02)      # noqa: E731
GLASS = lambda: k.mat(0x315F75, "cockpit-glass", 0.08, 0.15)        # noqa: E731
SCREEN = lambda: k.mat(0x5AD7E8, "cockpit-screen", 0.12, 0.18)      # noqa: E731
CYAN = lambda: k.mat(0x69E8F4, "cockpit-cyan-light", 0.18, 0.08)
DIM_CYAN = lambda: k.mat(0x1D5964, "cockpit-dim-cyan", 0.34, 0.12)    # noqa: E731
AMBER = lambda: k.mat(0xF5C84C, "cockpit-amber-light", 0.22, 0.08)  # noqa: E731
RED = lambda: k.mat(0xFF5C5C, "cockpit-red-light", 0.22, 0.08)      # noqa: E731
OLD = lambda: k.mat(0x8A5F34, "cockpit-corrosion", 0.86, 0.18)      # noqa: E731


def quad(bm, points):
    """One deterministic four-corner panel."""
    verts = [bm.verts.new(point) for point in points]
    bm.faces.new(verts)


def ring_tubes(bm, radius, tube_radius, segments=10):
    """Low-poly wheel in the local YZ plane; its axle is local X."""
    points = [
        (0.0, math.cos(i * math.tau / segments) * radius,
         math.sin(i * math.tau / segments) * radius)
        for i in range(segments)
    ]
    for i, point in enumerate(points):
        k.add_tube(bm, point, points[(i + 1) % segments],
                   tube_radius, tube_radius, 5)


def build_shell():
    k.asset("cockpit-shell", {
        "role": "viewmodel-static",
        "atlas": "../../textures/ships/cockpit-trim.ktx2",
    })

    # The pressure tub now reaches from the pilot's hips to the firewall. Broad
    # floor planes establish real cabin depth; the raised centre tunnel and
    # chamfered heel wells keep it from reading as one flat overlay.
    bm, done = k.part("pressure-floor", HULL(), 0.006)
    k.add_loft(bm, [
        k.plate_profile(0.025, 0.285, -0.255, -0.215, 0.025),
        k.plate_profile(-0.305, 0.350, -0.248, -0.195, 0.030),
        k.plate_profile(-0.665, 0.395, -0.225, -0.160, 0.035),
    ])
    done()

    bm, done = k.part("centre-tunnel", DARK(), 0.008)
    k.add_loft(bm, [
        k.plate_profile(0.010, 0.075, -0.238, -0.135, 0.018),
        k.plate_profile(-0.300, 0.088, -0.232, -0.115, 0.020),
        k.plate_profile(-0.575, 0.072, -0.210, -0.095, 0.018),
    ])
    done()

    # Deep side shells and layered consoles wrap around the pilot. Each console
    # is a structural lower body, an inset rubber deck, then a raised switch
    # rail; that stagger is the near-field parallax missing from the old slab.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"inner-sidewall-{name}", HULL(), 0.007)
        k.add_box(bm, (side * 0.410, -0.300, -0.120), (0.050, 0.500, 0.190),
                  Matrix.Rotation(side * -0.035, 3, "Y"))
        done()

        bm, done = k.part(f"sidewall-padding-{name}", RUBBER(), 0.006)
        k.add_box(bm, (side * 0.375, -0.090, -0.105), (0.030, 0.180, 0.105),
                  Matrix.Rotation(side * -0.08, 3, "Y"))
        done()

        bm, done = k.part(f"console-body-{name}", DARK(), 0.008)
        k.add_loft(bm, [
            k.plate_profile(-0.035, 0.102, -0.205, -0.095, 0.018, side * 0.270),
            k.plate_profile(-0.300, 0.112, -0.205, -0.070, 0.020, side * 0.282),
            k.plate_profile(-0.585, 0.105, -0.190, -0.045, 0.018, side * 0.300),
        ])
        done()

        bm, done = k.part(f"console-deck-{name}", DARK(), 0.004)
        k.add_box(bm, (side * 0.282, -0.282, -0.060), (0.165, 0.430, 0.032),
                  Matrix.Rotation(-0.065, 3, "X"))
        done()

        bm, done = k.part(f"console-handrest-{name}", RUBBER(), 0.006)
        k.add_box(bm, (side * 0.315, -0.100, -0.045), (0.100, 0.145, 0.038),
                  Matrix.Rotation(-0.04, 3, "X"))
        done()

        bm, done = k.part(f"console-screen-well-{name}", DARK(), 0.003)
        k.add_box(bm, (side * 0.285, -0.405, -0.043), (0.115, 0.125, 0.018),
                  Matrix.Rotation(-0.08, 3, "X"))
        done()

        # Two guarded toggles, four square keys and a rotary selector give both
        # side decks recognisable physical controls at first-person distance.
        for i in range(2):
            x = side * (0.255 + i * 0.040)
            bm, done = k.part(f"console-toggle-guard-{name}-{i}", STEEL())
            k.add_tube(bm, (x, -0.225, -0.042), (x, -0.225, -0.020),
                       0.007, 0.005, 6)
            done()
            bm, done = k.part(f"console-toggle-{name}-{i}", AMBER() if i else PALE())
            k.add_tube(bm, (x, -0.230, -0.020), (x, -0.245, 0.002),
                       0.0045, 0.0035, 6)
            done()
        for row in range(2):
            for col in range(2):
                bm, done = k.part(f"console-key-{name}-{row}-{col}", PALE(), 0.001)
                k.add_box(bm, (side * (0.255 + col * 0.038),
                               -0.320 - row * 0.041, -0.020),
                          (0.024, 0.024, 0.010))
                done()
        bm, done = k.part(f"console-selector-{name}", STEEL())
        k.add_tube(bm, (side * 0.314, -0.492, -0.030),
                   (side * 0.314, -0.492, -0.008), 0.014, 0.011, 10)
        done()

        # Seat side-bolsters, harness anchor and a rear cabin rib make the eye
        # position feel occupied instead of floating in front of a dashboard.
        bm, done = k.part(f"seat-bolster-{name}", RUBBER(), 0.008)
        k.add_box(bm, (side * 0.245, 0.005, -0.205), (0.135, 0.235, 0.105),
                  Matrix.Rotation(side * 0.10, 3, "Z"))
        done()
        bm, done = k.part(f"harness-anchor-{name}", STEEL())
        k.add_tube(bm, (side * 0.335, 0.010, -0.065),
                   (side * 0.320, -0.045, -0.095), 0.012, 0.009, 8)
        done()

    # Knee beam, firewall ribs and removable service covers connect the cabin
    # furniture into one machine. The pale covers imply years of field repair.
    bm, done = k.part("knee-cross-brace", STEEL(), 0.004)
    k.add_tube(bm, (-0.330, -0.540, -0.172), (0.330, -0.540, -0.172),
               0.014, 0.014, 8)
    done()
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"firewall-strut-{name}", STEEL())
        k.add_tube(bm, (side * 0.355, -0.585, -0.185),
                   (side * 0.270, -0.585, 0.075), 0.014, 0.010, 6)
        done()
        bm, done = k.part(f"service-cover-{name}", UPPER(), 0.003)
        k.add_box(bm, (side * 0.185, -0.585, -0.182), (0.125, 0.022, 0.055))
        done()

def build_canopy_frame():
    k.asset("canopy-frame", {"role": "viewmodel-static"})

    # A deep windshield cage, with each member terminating in a visible joint.
    # The rails converge toward the nose so motion produces genuine parallax.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"cockpit-sill-{name}", UPPER())
        k.add_tube(bm, (side * 0.365, -0.020, -0.090),
                   (side * 0.405, -0.715, -0.025), 0.023, 0.030, 8,
                   roll=math.pi / 8)
        done()

        bm, done = k.part(f"windscreen-post-{name}", UPPER())
        k.add_tube(bm, (side * 0.365, -0.065, -0.070),
                   (side * 0.345, -0.500, 0.245), 0.025, 0.019, 8,
                   roll=math.pi / 8)
        done()

        bm, done = k.part(f"roof-arch-{name}", UPPER())
        k.add_tube(bm, (side * 0.345, -0.500, 0.245),
                   (side * 0.095, -0.335, 0.282), 0.021, 0.015, 8,
                   roll=math.pi / 8)
        done()

        bm, done = k.part(f"lower-dash-brace-{name}", HULL())
        k.add_tube(bm, (side * 0.405, -0.710, -0.025),
                   (side * 0.305, -0.535, -0.130), 0.016, 0.012, 6,
                   roll=math.pi / 6)
        done()

        # Layered corner gussets and a bolt line make the cage feel assembled,
        # rather than painted around the edge of the screen.
        bm, done = k.part(f"pillar-gusset-{name}", HULL(), 0.004)
        k.add_box(bm, (side * 0.363, -0.495, 0.205), (0.095, 0.090, 0.080),
                  Matrix.Rotation(side * -0.14, 3, "Y"))
        done()
        for i, t in enumerate((0.16, 0.40, 0.64, 0.86)):
            p0 = (side * 0.365, -0.065, -0.070)
            p1 = (side * 0.345, -0.500, 0.245)
            p = tuple(p0[j] + (p1[j] - p0[j]) * t for j in range(3))
            bm, done = k.part(f"pillar-fastener-{name}-{i}", PALE())
            k.add_tube(bm, (p[0] - side * 0.006, p[1] + 0.002, p[2]),
                       (p[0] + side * 0.006, p[1] - 0.002, p[2]),
                       0.005, 0.005, 6)
            done()

        # Grab rails sit just inside the post. Only the port rail carries the
        # emergency pull, an asymmetric detail that keeps the cabin believable.
        bm, done = k.part(f"grab-rail-{name}", RUBBER())
        k.add_tube(bm, (side * 0.318, -0.165, 0.018),
                   (side * 0.315, -0.310, 0.132), 0.009, 0.009, 8)
        done()
        if side > 0:
            bm, done = k.part("canopy-emergency-pull", AMBER())
            k.add_tube(bm, (0.300, -0.245, 0.082),
                       (0.278, -0.245, 0.040), 0.009, 0.009, 8)
            done()

    # A split overhead header leaves the central flight path clean while still
    # showing roof depth. The small overhead unit carries physical toggles.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"header-beam-{name}", UPPER())
        k.add_tube(bm, (side * 0.095, -0.335, 0.282),
                   (side * 0.018, -0.305, 0.286), 0.016, 0.013, 8)
        done()
    bm, done = k.part("overhead-console", DARK(), 0.006)
    k.add_box(bm, (0.0, -0.292, 0.270), (0.145, 0.105, 0.042),
              Matrix.Rotation(-0.10, 3, "X"))
    done()
    for side in (-1, 1):
        bm, done = k.part(f"overhead-toggle-{k.side_name(side)}", PALE())
        k.add_tube(bm, (side * 0.038, -0.245, 0.263),
                   (side * 0.038, -0.226, 0.247), 0.004, 0.003, 6)
        done()


def build_canopy_glass():
    k.asset("canopy-glass", {
        "role": "viewmodel-glass",
        "atlas": "../../textures/ships/cockpit-glass.ktx2",
    })
    # Only peripheral panes are modelled. Their different depths produce edge
    # reflections without putting a sorting-sensitive polygon over the world.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"windscreen-cheek-{name}", GLASS())
        quad(bm, [
            (side * 0.354, -0.080, -0.052),
            (side * 0.397, -0.700, -0.012),
            (side * 0.338, -0.492, 0.228),
            (side * 0.108, -0.338, 0.267),
        ] if side > 0 else [
            (side * 0.108, -0.338, 0.267),
            (side * 0.338, -0.492, 0.228),
            (side * 0.397, -0.700, -0.012),
            (side * 0.354, -0.080, -0.052),
        ])
        done()

        bm, done = k.part(f"side-window-return-{name}", GLASS())
        quad(bm, [
            (side * 0.365, -0.030, -0.060),
            (side * 0.354, -0.080, -0.052),
            (side * 0.338, -0.492, 0.228),
            (side * 0.365, -0.230, 0.165),
        ] if side > 0 else [
            (side * 0.365, -0.230, 0.165),
            (side * 0.338, -0.492, 0.228),
            (side * 0.354, -0.080, -0.052),
            (side * 0.365, -0.030, -0.060),
        ])
        done()

def add_bezel(root_name, cx, cy, width, height, z, material, yaw=0.0):
    """Deep four-piece display bezel, optionally canted toward the pilot."""
    rim = 0.010
    depth = 0.024
    rotation = Matrix.Rotation(yaw, 3, "Z")
    cosine = math.cos(yaw)
    sine = math.sin(yaw)
    for suffix, dx, dz, size in (
        ("top", 0.0, height / 2, (width, depth, rim)),
        ("bottom", 0.0, -height / 2, (width, depth, rim)),
        ("left", -width / 2, 0.0, (rim, depth, height)),
        ("right", width / 2, 0.0, (rim, depth, height)),
    ):
        center = (cx + dx * cosine, cy + dx * sine, z + dz)
        bm, done = k.part(f"{root_name}-bezel-{suffix}", material)
        k.add_box(bm, center, size, rotation)
        done()


def display_uvs(obj, cx, cy, cz, width, height, yaw):
    """Map a pilot-facing display quad to an exact 0..1 canvas rectangle."""
    mesh = obj.data
    layer = mesh.uv_layers.active
    cosine = math.cos(yaw)
    sine = math.sin(yaw)
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            co = mesh.vertices[vertex_index].co
            local_x = (co.x - cx) * cosine + (co.y - cy) * sine
            u = 0.5 - local_x / width
            v = 1.0 - (co.z - (cz - height / 2)) / height
            layer.data[loop_index].uv = (u, v)
    mesh.update()


def build_display(root_name, cx, cy, cz, width, height, yaw=0.0):
    k.asset(root_name, {
        "role": "viewmodel-display",
        "canvasUv": "0..1",
        "pilotFacing": True,
    })
    cosine = math.cos(yaw)
    sine = math.sin(yaw)
    points = []
    for dx, dz in ((-width / 2, -height / 2),
                   (-width / 2, height / 2),
                   (width / 2, height / 2),
                   (width / 2, -height / 2)):
        points.append((cx + dx * cosine, cy + dx * sine, cz + dz))
    bm, done = k.part(f"{root_name}-face", SCREEN())
    quad(bm, points)
    obj = done()
    display_uvs(obj, cx, cy, cz, width, height, yaw)


def build_displays():
    # Source +X becomes runtime -X after the established PI rotation, so the
    # primary flight display lands on the pilot's left and systems on the right.
    build_display("display-primary", 0.132, -0.407, -0.022, 0.108, 0.066, 0.12)
    build_display("display-nav", 0.000, -0.405, -0.014, 0.118, 0.076)
    build_display("display-systems", -0.132, -0.407, -0.022, 0.108, 0.066, -0.12)


def build_dashboard():
    k.asset("dashboard", {
        "role": "viewmodel-static",
        "atlas": "../../textures/ships/cockpit-trim.ktx2",
    })

    # A low structural beam carries three separate instrument islands. There is
    # no full-width coaming: open gaps between the binnacles preserve the view
    # and let the shell, controls and world read at different depths.
    bm, done = k.part("lower-beam-centre", DARK(), 0.003)
    k.add_box(bm, (0.0, -0.445, -0.133), (0.090, 0.072, 0.028))
    done()
    bm, done = k.part("lower-beam-centre-lip", RUBBER())
    k.add_box(bm, (0.0, -0.403, -0.116), (0.080, 0.018, 0.007))
    done()
    for side in (-1, 1):
        name = k.side_name(side)
        rotation = Matrix.Rotation(side * -0.065, 3, "Z")
        bm, done = k.part(f"lower-beam-wing-{name}", HULL(), 0.003)
        k.add_box(bm, (side * 0.142, -0.445, -0.133),
                  (0.170, 0.072, 0.028), rotation)
        done()
        bm, done = k.part(f"lower-beam-lip-{name}", RUBBER())
        k.add_box(bm, (side * 0.142, -0.403, -0.116),
                  (0.150, 0.018, 0.007), rotation)
        done()

    # Raised centre nav binnacle: a deep charcoal carrier, padded eyebrow and
    # visible support neck. Its narrow width makes it a focal point, not a wall.
    bm, done = k.part("nav-binnacle-carrier", DARK(), 0.006)
    k.add_box(bm, (0.0, -0.450, -0.022), (0.155, 0.080, 0.136))
    done()
    bm, done = k.part("nav-binnacle-hood", DARK(), 0.002)
    k.add_box(bm, (0.0, -0.405, 0.050), (0.120, 0.072, 0.010),
              Matrix.Rotation(-0.035, 3, "X"))
    for side in (-1, 1):
        k.add_box(bm, (side * 0.057, -0.421, 0.022),
                  (0.009, 0.068, 0.054), Matrix.Rotation(side * -0.05, 3, "Z"))
    done()
    bm, done = k.part("nav-binnacle-neck", DARK(), 0.004)
    k.add_box(bm, (0.0, -0.455, -0.105), (0.090, 0.065, 0.050))
    done()

    displays = [
        ("primary", 0.132, -0.407, -0.022, 0.108, 0.066, 0.12),
        ("nav", 0.000, -0.405, -0.014, 0.118, 0.076, 0.0),
        ("systems", -0.132, -0.407, -0.022, 0.108, 0.066, -0.12),
    ]

    for name, x, face_y, z, width, height, yaw in displays:
        rotation = Matrix.Rotation(yaw, 3, "Z")
        if name != "nav":
            bm, done = k.part(f"{name}-angled-carrier", DARK(), 0.005)
            k.add_box(bm, (x, -0.448, -0.034), (0.135, 0.078, 0.116), rotation)
            done()
            bm, done = k.part(f"{name}-wing-hood", DARK(), 0.002)
            k.add_box(bm, (x, -0.405, 0.026), (0.122, 0.068, 0.009), rotation)
            done()
            bm, done = k.part(f"{name}-beam-strut", UPPER())
            k.add_tube(bm, (x * 0.82, -0.465, -0.128),
                       (x * 0.92, -0.462, -0.084), 0.012, 0.009, 6)
            done()

        # The black well sits just behind the independent CanvasTexture plane.
        bm, done = k.part(f"{name}-display-well", DARK(), 0.002)
        cosine = math.cos(yaw)
        sine = math.sin(yaw)
        well_y = face_y - 0.016
        k.add_box(bm, (x, well_y, z),
                  (width + 0.012, 0.020, height + 0.012), rotation)
        done()
        add_bezel(name, x, face_y - 0.020, width + 0.026,
                  height + 0.026, z, UPPER(), yaw)

        for corner, sx, sz in (("tl", -1, 1), ("tr", 1, 1),
                               ("bl", -1, -1), ("br", 1, -1)):
            dx = sx * (width / 2 + 0.017)
            bx = x + dx * cosine
            by = face_y - 0.004 + dx * sine
            bm, done = k.part(f"{name}-fastener-{corner}", STEEL())
            k.add_tube(bm, (bx, by - 0.006, z + sz * (height / 2 + 0.017)),
                       (bx, by + 0.005, z + sz * (height / 2 + 0.017)),
                       0.0038, 0.0038, 6)
            done()

        # Three compact softkeys sit close enough to the display to read as its
        # controls. Dark housings with coloured caps avoid pale rectangular bars.
        for i in range(3):
            dx = -0.030 + i * 0.030
            bx = x + dx * cosine
            by = face_y + 0.006 + dx * sine
            bm, done = k.part(f"{name}-softkey-{i}",
                              AMBER() if i == 1 and name == "systems" else STEEL())
            k.add_box(bm, (bx, by, z - height / 2 - 0.018),
                      (0.017, 0.012, 0.009), rotation)
            done()

    # Compact utility pods terminate the beam without rising into the glass.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"utility-pod-{name}", DARK(), 0.004)
        k.add_box(bm, (side * 0.267, -0.445, -0.094), (0.060, 0.072, 0.082),
                  Matrix.Rotation(side * -0.08, 3, "Z"))
        done()
        bm, done = k.part(f"standby-gauge-{name}", DARK())
        k.add_tube(bm, (side * 0.267, -0.404, -0.080),
                   (side * 0.267, -0.391, -0.080), 0.022, 0.022, 12)
        done()
        bm, done = k.part(f"standby-gauge-hub-{name}", STEEL())
        k.add_tube(bm, (side * 0.267, -0.388, -0.080),
                   (side * 0.267, -0.382, -0.080), 0.005, 0.005, 8)
        done()
        for i in range(3):
            bm, done = k.part(f"breaker-{name}-{i}", RED() if i == 2 else STEEL())
            k.add_tube(bm, (side * (0.252 + (i % 2) * 0.026),
                            -0.385, -0.109 - (i // 2) * 0.022),
                       (side * (0.252 + (i % 2) * 0.026),
                        -0.374, -0.109 - (i // 2) * 0.022),
                       0.0045, 0.0035, 6)
            done()

    # Five low demist slots trace the base of the windscreen on each side.
    for side in (-1, 1):
        name = k.side_name(side)
        for i in range(5):
            bm, done = k.part(f"demist-vent-{name}-{i}", DARK())
            k.add_box(bm, (side * (0.170 + i * 0.023), -0.347, -0.086),
                      (0.014, 0.080, 0.006), Matrix.Rotation(side * -0.10, 3, "Y"))
            done()

    # Control housings are pulled inward and upward to sit inside the visible
    # lower corners. The moving roots still use their established pivots.
    bm, done = k.part("throttle-quadrant", DARK(), 0.005)
    k.add_box(bm, (-0.205, -0.250, -0.038), (0.105, 0.175, 0.060),
              Matrix.Rotation(-0.11, 3, "X"))
    done()
    bm, done = k.part("brake-quadrant", DARK(), 0.004)
    k.add_box(bm, (-0.142, -0.255, -0.052), (0.050, 0.140, 0.045),
              Matrix.Rotation(-0.09, 3, "X"))
    done()
    bm, done = k.part("trim-wheel-housing", DARK(), 0.004)
    k.add_box(bm, (0.190, -0.270, -0.040), (0.090, 0.095, 0.078))
    done()

    bm, done = k.part("maintenance-plate", HULL(), 0.003)
    k.add_box(bm, (-0.220, -0.468, -0.132), (0.070, 0.018, 0.032))
    done()
    bm, done = k.part("emergency-handle", AMBER())
    k.add_tube(bm, (0.205, -0.440, -0.132),
               (0.255, -0.440, -0.132), 0.008, 0.008, 8)
    done()

def build_lights():
    k.asset("cockpit-lights", {
        "role": "viewmodel-emissive",
        "atlas": "../../textures/ships/cockpit-emissive.ktx2",
    })

    # Reflected edge illumination and annunciators only. Screen surfaces were
    # intentionally removed; display-primary/nav/systems own live canvases.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"coaming-wash-{name}", DIM_CYAN())
        k.add_box(bm, (side * 0.080, -0.370, 0.034), (0.055, 0.008, 0.004))
        done()
        bm, done = k.part(f"console-backlight-{name}", DIM_CYAN())
        k.add_box(bm, (side * 0.285, -0.405, -0.032), (0.090, 0.008, 0.004))
        done()

    for i in range(9):
        factory = RED if i == 8 else AMBER if i in (0, 1, 7) else CYAN
        bm, done = k.part(f"annunciator-{i}", factory())
        k.add_box(bm, (-0.128 + i * 0.032, -0.383, -0.115),
                  (0.019, 0.006, 0.008))
        done()

    # Tiny gauge needles and bezel index marks are useful reference points but
    # do not compete with the CanvasTexture instruments.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"standby-needle-{name}", AMBER())
        k.add_box(bm, (side * 0.267, -0.381, -0.074),
                  (0.004, 0.004, 0.025), Matrix.Rotation(side * -0.52, 3, "Y"))
        done()
        for i in range(3):
            bm, done = k.part(f"wing-lamp-{name}-{i}", CYAN() if i < 2 else AMBER())
            k.add_box(bm, (side * 0.278, -0.382, -0.102 - i * 0.018),
                      (0.009, 0.004, 0.007))
            done()

def build_flight_stick():
    k.asset("flight-stick", {"role": "control", "pivot": "gimbal"})
    bm, done = k.part("stick-gimbal", STEEL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, -0.008, 0.042),
               0.038, 0.030, 10)
    done()
    bm, done = k.part("stick-boot", RUBBER(), 0.004)
    k.add_loft(bm, [
        k.plate_profile(-0.006, 0.038, 0.028, 0.064, 0.010),
        k.plate_profile(-0.012, 0.026, 0.058, 0.100, 0.008),
    ])
    done()
    bm, done = k.part("stick-stem", DARK())
    k.add_tube(bm, (0.0, -0.010, 0.082), (0.0, -0.030, 0.235),
               0.015, 0.012, 8)
    done()
    bm, done = k.part("stick-grip", RUBBER(), 0.004)
    k.add_box(bm, (0.0, -0.038, 0.275), (0.058, 0.050, 0.120),
              Matrix.Rotation(-0.12, 3, "X"))
    done()
    bm, done = k.part("stick-palm-rest", RUBBER())
    k.add_tube(bm, (-0.047, -0.030, 0.235), (0.047, -0.030, 0.235),
               0.012, 0.012, 8)
    done()
    bm, done = k.part("stick-trigger", AMBER())
    k.add_box(bm, (0.0, -0.071, 0.278), (0.015, 0.018, 0.038),
              Matrix.Rotation(-0.25, 3, "X"))
    done()
    bm, done = k.part("stick-hat", CYAN())
    k.add_tube(bm, (0.0, -0.042, 0.335), (0.0, -0.050, 0.350),
               0.010, 0.007, 8)
    done()
    for side in (-1, 1):
        bm, done = k.part(f"stick-thumb-{k.side_name(side)}", CYAN())
        k.add_tube(bm, (side * 0.017, -0.064, 0.305),
                   (side * 0.017, -0.071, 0.315), 0.006, 0.005, 6)
        done()


def build_throttle():
    k.asset("throttle-lever", {"role": "control", "pivot": "quadrant"})
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"throttle-arm-{name}", STEEL())
        k.add_tube(bm, (side * 0.016, 0.0, 0.0),
                   (side * 0.020, -0.032, 0.142), 0.009, 0.007, 7)
        done()
        bm, done = k.part(f"throttle-hub-{name}", DARK())
        k.add_tube(bm, (side * 0.016 - 0.009, 0.0, 0.0),
                   (side * 0.016 + 0.009, 0.0, 0.0), 0.016, 0.016, 8)
        done()
    bm, done = k.part("throttle-grip", RUBBER(), 0.003)
    k.add_tube(bm, (-0.044, -0.040, 0.148), (0.044, -0.040, 0.148),
               0.020, 0.020, 10)
    done()
    bm, done = k.part("throttle-boost-paddle", AMBER(), 0.001)
    k.add_box(bm, (0.0, -0.063, 0.153), (0.030, 0.012, 0.028))
    done()


def build_brake():
    k.asset("brake-lever", {"role": "control", "pivot": "quadrant"})
    bm, done = k.part("brake-arm", STEEL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, -0.026, 0.120),
               0.008, 0.006, 7)
    done()
    bm, done = k.part("brake-grip", RED())
    k.add_tube(bm, (-0.026, -0.032, 0.128), (0.026, -0.032, 0.128),
               0.014, 0.014, 8)
    done()

def build_trim_wheel():
    k.asset("trim-wheel", {"role": "control", "pivot": "axle"})
    bm, done = k.part("trim-ring", RUBBER())
    ring_tubes(bm, 0.050, 0.005, 12)
    done()
    bm, done = k.part("trim-spokes", STEEL())
    for angle in (0.0, math.pi / 2):
        a = (0.0, math.cos(angle) * 0.044, math.sin(angle) * 0.044)
        b = (0.0, -a[1], -a[2])
        k.add_tube(bm, a, b, 0.0035, 0.0035, 5)
    k.add_tube(bm, (-0.008, 0.0, 0.0), (0.008, 0.0, 0.0),
               0.010, 0.010, 8)
    done()


def build_rocker():
    k.asset("autopilot-rocker", {"role": "control", "pivot": "centre"})
    bm, done = k.part("rocker-body", PALE(), 0.0015)
    k.add_box(bm, (0.0, 0.0, 0.0), (0.020, 0.012, 0.036),
              Matrix.Rotation(-0.12, 3, "X"))
    done()
    bm, done = k.part("rocker-lamp", CYAN())
    k.add_box(bm, (0.0, -0.008, 0.010), (0.011, 0.004, 0.009))
    done()


def build_pedal(side):
    name = k.side_name(side)
    k.asset(f"pedal-{name}", {"role": "control", "pivot": "hinge"})
    bm, done = k.part(f"pedal-linkage-{name}", STEEL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, -0.055, -0.020),
               0.007, 0.007, 6)
    done()
    bm, done = k.part(f"pedal-face-{name}", RUBBER(), 0.002)
    k.add_box(bm, (0.0, -0.064, -0.020), (0.070, 0.018, 0.038),
              Matrix.Rotation(-0.18, 3, "X"))
    done()
    for i in (-1, 0, 1):
        bm, done = k.part(f"pedal-rib-{name}-{i}", STEEL())
        k.add_box(bm, (i * 0.020, -0.075, -0.020), (0.004, 0.004, 0.030))
        done()


def build_airlock():
    k.asset("airlock-door", {"role": "transition", "pivot": "upper-track"})
    bm, done = k.part("airlock-pressure-plate", HULL(), 0.018)
    k.add_box(bm, (0.0, 0.0, -0.82), (1.05, 0.10, 1.64))
    done()
    bm, done = k.part("airlock-inner-panel", PALE(), 0.010)
    k.add_box(bm, (0.0, -0.058, -0.82), (0.83, 0.035, 1.35))
    done()
    bm, done = k.part("airlock-window", GLASS(), 0.006)
    k.add_box(bm, (0.0, -0.082, -0.42), (0.50, 0.018, 0.34))
    done()
    for side in (-1, 1):
        bm, done = k.part(f"airlock-track-{k.side_name(side)}", STEEL())
        k.add_box(bm, (side * 0.485, -0.062, -0.82), (0.045, 0.045, 1.52))
        done()
    for i in range(3):
        bm, done = k.part(f"airlock-latch-{i}", DARK(), 0.002)
        k.add_box(bm, (0.39, -0.093, -0.40 - i * 0.40), (0.10, 0.028, 0.075))
        done()
    bm, done = k.part("airlock-handle", AMBER())
    k.add_tube(bm, (-0.18, -0.105, -1.12), (0.18, -0.105, -1.12),
               0.018, 0.018, 8)
    done()


def build_ramp():
    k.asset("boarding-ramp", {"role": "transition", "pivot": "door-sill"})
    bm, done = k.part("ramp-deck", HULL(), 0.012)
    k.add_box(bm, (0.0, -1.05, -0.045), (0.96, 2.10, 0.09))
    done()
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"ramp-edge-{name}", STEEL(), 0.006)
        k.add_box(bm, (side * 0.465, -1.05, 0.025), (0.055, 2.02, 0.12))
        done()
    for i in range(7):
        bm, done = k.part(f"ramp-tread-{i}", RUBBER(), 0.002)
        k.add_box(bm, (0.0, -0.23 - i * 0.27, 0.010), (0.78, 0.075, 0.024))
        done()
    bm, done = k.part("ramp-warning-strip", AMBER())
    k.add_box(bm, (0.0, -2.045, 0.020), (0.78, 0.075, 0.028))
    done()


def build_gear(side=None):
    if side is None:
        root_name = "landing-gear-nose"
        x = 0.0
    else:
        root_name = f"landing-gear-{k.side_name(side)}"
        x = 0.0
    k.asset(root_name, {"role": "transition", "pivot": "trunnion"})
    bm, done = k.part(f"{root_name}-oleo", STEEL())
    k.add_tube(bm, (x, 0.0, 0.0), (x, 0.0, -0.72),
               0.052 if side is not None else 0.040,
               0.038 if side is not None else 0.030, 8)
    done()
    bm, done = k.part(f"{root_name}-collar", DARK())
    k.add_tube(bm, (x, 0.0, -0.16), (x, 0.0, -0.31),
               0.070 if side is not None else 0.055,
               0.070 if side is not None else 0.055, 8)
    done()
    # Paired low-poly tyres share the same axle and remain one rigid root.
    for wheel_side in (-1, 1):
        wx = wheel_side * (0.105 if side is not None else 0.075)
        bm, done = k.part(f"{root_name}-tyre-{wheel_side:+d}", RUBBER())
        k.add_tube(bm, (wx - 0.030, 0.0, -0.74),
                   (wx + 0.030, 0.0, -0.74),
                   0.115 if side is not None else 0.090,
                   0.115 if side is not None else 0.090, 10)
        done()
        bm, done = k.part(f"{root_name}-hub-{wheel_side:+d}", PALE())
        k.add_tube(bm, (wx - 0.034, 0.0, -0.74),
                   (wx + 0.034, 0.0, -0.74),
                   0.045, 0.045, 8)
        done()
    bm, done = k.part(f"{root_name}-door", HULL(), 0.008)
    door_x = 0.17 if side is None else (0.20 * side)
    k.add_box(bm, (door_x, 0.035, -0.27), (0.20, 0.055, 0.60),
              Matrix.Rotation((0.16 if side is None else side * 0.12), 3, "Y"))
    done()


def build():
    build_shell()
    build_canopy_frame()
    build_canopy_glass()
    build_dashboard()
    build_displays()
    build_lights()
    build_flight_stick()
    build_throttle()
    build_brake()
    build_trim_wheel()
    build_rocker()
    build_pedal(1)
    build_pedal(-1)
    build_airlock()
    build_ramp()
    build_gear(1)
    build_gear(-1)
    build_gear()


# Unique cockpit geometry is allowed more detail than an instanced prop, while
# each moving/transition root remains far below the mobile-friendly ceiling.
k.run("runabout cockpit", build, tri_budget=9000, per_asset=2400)
