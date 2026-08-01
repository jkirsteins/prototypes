extends MultiMeshInstance3D
class_name GrassField

## Stylized triangle-blade grass tufts on a MultiMesh. Vertex COLOR carries the
## gradient; COLOR.a is the sway weight (0 at the root so blades stay planted).

const TUFT_COUNT := 14000
const FIELD_RADIUS := 70.0
const BLADES_PER_TUFT := 5

var terrain: Terrain

const SWAY_SHADER := "
shader_type spatial;
render_mode cull_disabled;

uniform float wind_strength = 0.12;
uniform float wind_speed = 1.4;

void vertex() {
	vec3 world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = world_pos.x * 0.35 + world_pos.z * 0.28;
	float sway = sin(TIME * wind_speed + phase) + 0.4 * sin(TIME * wind_speed * 2.7 + phase * 1.7);
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
	var mesh := _build_tuft_mesh(rng)
	var mat := ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = SWAY_SHADER
	mat.shader = shader
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
		var t := Transform3D(Basis(Vector3.UP, rng.randf() * TAU)
			.scaled(Vector3.ONE * rng.randf_range(0.7, 1.35)),
			Vector3(x, terrain.height_at(x, z), z))
		mm.set_instance_transform(i, t)
	multimesh = mm
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

func _build_tuft_mesh(rng: RandomNumberGenerator) -> ArrayMesh:
	var verts := PackedVector3Array()
	var colors := PackedColorArray()
	var normals := PackedVector3Array()
	var base_color := Color(0.18, 0.26, 0.09)
	var tip_color := Color(0.70, 0.62, 0.26)
	for b in BLADES_PER_TUFT:
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
