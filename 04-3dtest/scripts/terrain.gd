extends StaticBody3D
class_name Terrain

## Procedural rolling meadow. One vertex per meter so the visual mesh and the
## HeightMapShape3D collision sample identical heights - HeightMapShape3D has a
## fixed 1-unit cell spacing, and matching it beats scaling a collision shape.

const SIZE := 200                 # meters per side; vertices run -SIZE/2 .. +SIZE/2
const NOISE_SEED := 20260801
const CLEARING_RADIUS := 24.0     # flattened circle at the center for the cabin
const CLEARING_FADE := 22.0       # meters over which the flattening eases out

var _noise := FastNoiseLite.new()
var _noise_large := FastNoiseLite.new()

func _init() -> void:
	_noise.seed = NOISE_SEED
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise.frequency = 0.018
	_noise.fractal_octaves = 3
	_noise_large.seed = NOISE_SEED + 7
	_noise_large.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise_large.frequency = 0.004

func _ready() -> void:
	_build_mesh()
	_build_collision()

## Ground height at any world x/z. Same function feeds the mesh, the collision
## heights and all scatter placement, so everything sits on the ground exactly.
func height_at(x: float, z: float) -> float:
	var h := _noise.get_noise_2d(x, z) * 2.6 + _noise_large.get_noise_2d(x, z) * 5.0
	var d := Vector2(x, z).length()
	if d < CLEARING_RADIUS + CLEARING_FADE:
		var t: float = clampf((d - CLEARING_RADIUS) / CLEARING_FADE, 0.0, 1.0)
		var ease_t := t * t * (3.0 - 2.0 * t)
		var clearing_h := _noise_large.get_noise_2d(0.0, 0.0) * 5.0
		h = lerpf(clearing_h, h, ease_t)
	return h

func normal_at(x: float, z: float) -> Vector3:
	var e := 0.5
	var dx := height_at(x + e, z) - height_at(x - e, z)
	var dz := height_at(x, z + e) - height_at(x, z - e)
	return Vector3(-dx, 2.0 * e, -dz).normalized()

func _build_mesh() -> void:
	var half := SIZE / 2
	var verts_per_side := SIZE + 1
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	vertices.resize(verts_per_side * verts_per_side)
	normals.resize(verts_per_side * verts_per_side)
	uvs.resize(verts_per_side * verts_per_side)
	for zi in verts_per_side:
		for xi in verts_per_side:
			var x := float(xi - half)
			var z := float(zi - half)
			var i := zi * verts_per_side + xi
			vertices[i] = Vector3(x, height_at(x, z), z)
			normals[i] = normal_at(x, z)
			uvs[i] = Vector2(x, z) / 5.0
	for zi in SIZE:
		for xi in SIZE:
			var i := zi * verts_per_side + xi
			# Godot front faces wind clockwise; the reverse order gets culled
			# from above and the whole terrain vanishes behind the sky.
			indices.append_array([i, i + 1, i + verts_per_side,
				i + 1, i + verts_per_side + 1, i + verts_per_side])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mi := MeshInstance3D.new()
	mi.name = "TerrainMesh"
	mi.mesh = mesh
	mi.material_override = _ground_material()
	add_child(mi)

const GROUND_SHADER := "
shader_type spatial;

uniform sampler2D grass_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D dirt_tex : source_color, filter_linear_mipmap, repeat_enable;

varying vec3 world_pos;
varying float flatness;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	flatness = NORMAL.y;
}

void fragment() {
	// Two widely-spaced tilings multiplied together: each hides the other's
	// repetition, which photo textures otherwise show badly on open ground.
	vec3 fine = texture(grass_tex, world_pos.xz * 0.19).rgb;
	vec3 macro = texture(grass_tex, world_pos.xz * 0.021).rgb;
	vec3 grass = fine * macro * 2.1;
	vec3 dirt = texture(dirt_tex, world_pos.xz * 0.16).rgb;
	float dirt_amt = smoothstep(0.045, 0.16, 1.0 - flatness);
	ALBEDO = mix(grass, dirt, dirt_amt) * vec3(1.0, 0.98, 0.88);
	ROUGHNESS = 1.0;
	SPECULAR = 0.05;
}
"

func _ground_material() -> Material:
	var grass_path := "res://assets/textures/grass_albedo.jpg"
	var dirt_path := "res://assets/textures/dirt_albedo.jpg"
	if not ResourceLoader.exists(grass_path):
		var flat := StandardMaterial3D.new()
		flat.albedo_color = Color(0.35, 0.38, 0.22)
		flat.roughness = 1.0
		return flat
	var mat := ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = GROUND_SHADER
	mat.shader = shader
	mat.set_shader_parameter("grass_tex", load(grass_path))
	mat.set_shader_parameter("dirt_tex",
		load(dirt_path) if ResourceLoader.exists(dirt_path) else load(grass_path))
	return mat

func _build_collision() -> void:
	var verts_per_side := SIZE + 1
	var half := SIZE / 2
	var data := PackedFloat32Array()
	data.resize(verts_per_side * verts_per_side)
	for zi in verts_per_side:
		for xi in verts_per_side:
			data[zi * verts_per_side + xi] = height_at(float(xi - half), float(zi - half))
	var shape := HeightMapShape3D.new()
	shape.map_width = verts_per_side
	shape.map_depth = verts_per_side
	shape.map_data = data
	var owner_id := create_shape_owner(self)
	shape_owner_add_shape(owner_id, shape)
