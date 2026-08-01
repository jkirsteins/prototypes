extends MultiMeshInstance3D
class_name GrassField

## Meadow grass as crossed textured cards on a MultiMesh. With a photographic
## cutout texture this reads as real grass; without one it falls back to
## simple colored blades so the scene still works.

const TUFT_COUNT := 11000
const FIELD_RADIUS := 70.0

var terrain: Terrain
var card_texture_path := ""

const CARD_SHADER := "
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D card_tex : source_color, filter_linear_mipmap;
uniform float wind_strength = 0.09;
uniform float wind_speed = 1.25;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = world_pos.x * 0.31 + world_pos.z * 0.27;
	float sway = sin(TIME * wind_speed + phase)
		+ 0.35 * sin(TIME * wind_speed * 2.3 + phase * 1.9);
	VERTEX.x += sway * wind_strength * COLOR.a;
	VERTEX.z += sway * wind_strength * 0.6 * COLOR.a;
}

void fragment() {
	vec4 c = texture(card_tex, UV);
	// Cheap per-patch value variation so the meadow is not one flat tone.
	float v = fract(sin(dot(floor(world_pos.xz * 0.7),
		vec2(12.9898, 78.233))) * 43758.5453);
	ALBEDO = c.rgb * mix(0.82, 1.08, v) * vec3(1.0, 0.97, 0.86);
	ALPHA = c.a;
	ALPHA_SCISSOR_THRESHOLD = 0.45;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
"

const BLADE_SHADER := "
shader_type spatial;
render_mode cull_disabled;

uniform float wind_strength = 0.1;
uniform float wind_speed = 1.3;

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = wp.x * 0.35 + wp.z * 0.28;
	float sway = sin(TIME * wind_speed + phase)
		+ 0.4 * sin(TIME * wind_speed * 2.7 + phase * 1.7);
	VERTEX.x += sway * wind_strength * COLOR.a;
	VERTEX.z += sway * wind_strength * 0.6 * COLOR.a;
}

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 1.0;
}
"

func _ready() -> void:
	if terrain == null:
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = 4242
	var use_cards := card_texture_path != "" and ResourceLoader.exists(card_texture_path)
	var mesh := _build_card_mesh() if use_cards else _build_blade_mesh(rng)
	var mat := ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = CARD_SHADER if use_cards else BLADE_SHADER
	mat.shader = shader
	if use_cards:
		mat.set_shader_parameter("card_tex", load(card_texture_path))
	mesh.surface_set_material(0, mat)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = TUFT_COUNT
	for i in TUFT_COUNT:
		var r := sqrt(rng.randf()) * FIELD_RADIUS
		var a := rng.randf() * TAU
		var x := cos(a) * r
		var z := sin(a) * r
		var s := rng.randf_range(0.75, 1.4)
		var t := Transform3D(Basis(Vector3.UP, rng.randf() * TAU)
			.scaled(Vector3(s, s * rng.randf_range(0.85, 1.15), s)),
			Vector3(x, terrain.height_at(x, z) - 0.02, z))
		mm.set_instance_transform(i, t)
	multimesh = mm
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

## Three quads crossed at 60 degrees, pivot at the base. COLOR.a is the sway
## weight (0 at the roots), UV spans the full card.
func _build_card_mesh() -> ArrayMesh:
	var verts := PackedVector3Array()
	var colors := PackedColorArray()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var width := 0.9
	var height := 0.55
	for q in 3:
		var ang := q * PI / 3.0
		var dir := Vector3(cos(ang), 0, sin(ang)) * (width / 2.0)
		var base := verts.size()
		verts.append_array([-dir, dir, dir + Vector3.UP * height, -dir + Vector3.UP * height])
		var root := Color(1, 1, 1, 0)
		var tip := Color(1, 1, 1, 1)
		colors.append_array([root, root, tip, tip])
		uvs.append_array([Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)])
		for k in 4:
			normals.append(Vector3.UP)
		indices.append_array([base, base + 2, base + 1, base, base + 3, base + 2])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

func _build_blade_mesh(rng: RandomNumberGenerator) -> ArrayMesh:
	var verts := PackedVector3Array()
	var colors := PackedColorArray()
	var normals := PackedVector3Array()
	var base_color := Color(0.18, 0.26, 0.09)
	var tip_color := Color(0.70, 0.62, 0.26)
	for b in 6:
		var ang := rng.randf() * TAU
		var lean := rng.randf_range(0.05, 0.25)
		var h := rng.randf_range(0.30, 0.58)
		var w := rng.randf_range(0.045, 0.075)
		var dir := Vector3(cos(ang), 0, sin(ang))
		var side := Vector3(-dir.z, 0, dir.x) * w
		var root := dir * rng.randf_range(0.0, 0.12)
		var tip := root + dir * lean + Vector3.UP * h
		verts.append_array([root - side, root + side, tip])
		var tip_c := tip_color.lerp(base_color, rng.randf() * 0.4)
		tip_c.a = 1.0
		var root_c := base_color
		root_c.a = 0.0
		colors.append_array([root_c, root_c, tip_c])
		for i in 3:
			normals.append(Vector3.UP)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_NORMAL] = normals
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
