"""Generic .blend -> .glb export. One script for every model, forever.

This replaces the per-asset Python of the original pipeline for anything
hand-modelled in the Blender GUI: build-ship.mjs runs it headless against the
registered .blend, and then scripts/uplift/normalize.mjs repairs whatever the
export got wrong (missing UVs, live transforms, tangents, textures...). So
this script stays dumb on purpose — open the file, export it, say what it saw.

The settings mirror kitlib.run()'s, which are deliberately the stock ones: a
File -> Export -> glTF 2.0 from the GUI with defaults produces the same file.

    blender --background --factory-startup --python blend-export.py -- \
        --blend model.blend --glb out.glb
"""
import argparse
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--blend", required=True)
ap.add_argument("--glb", required=True)
args = ap.parse_args(argv)

bpy.ops.wm.open_mainfile(filepath=bpy.path.abspath(args.blend))

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
tris = 0
for obj in meshes:
    obj.data.calc_loop_triangles()
    tris += len(obj.data.loop_triangles)
print(f"{bpy.path.basename(args.blend)}: {len(meshes)} mesh object(s), {tris} triangles")

bpy.ops.export_scene.gltf(
    filepath=bpy.path.abspath(args.glb),
    export_format="GLB",
    export_yup=True,
    export_apply=True,          # modifiers become geometry
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,      # the merge needs a uniform attribute set
    export_materials="EXPORT",  # only base colour survives; normalize enforces that
    export_extras=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,    # motion lives in the shader, not the file
)
print(f"  wrote {args.glb}")
