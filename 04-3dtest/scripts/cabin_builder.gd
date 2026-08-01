extends Object
class_name CabinBuilder

## Builds a log cabin from stacked cylinder logs and plank slabs, textured
## with the ambientCG wood maps. Fallback for when no realistic cabin model
## could be sourced: photo textures at real scale keep it out of toy territory.

const WIDTH := 6.0    # X, front face
const DEPTH := 5.0    # Z
const WALL_H := 2.5
const LOG_R := 0.14
const GABLE_H := 1.7

static func build() -> Node3D:
	var root := Node3D.new()
	root.name = "Cabin"
	var wood := _wood_material(Vector3(3.0, 1.0, 1.0))
	var roof_mat := _wood_material(Vector3(4.0, 2.0, 1.0), Color(0.45, 0.40, 0.36))
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.09, 0.07, 0.05)
	dark.roughness = 1.0

	var layers := int(WALL_H / (LOG_R * 2.0))
	var long_log := CylinderMesh.new()
	long_log.top_radius = LOG_R
	long_log.bottom_radius = LOG_R
	long_log.height = WIDTH + LOG_R * 2.0
	long_log.radial_segments = 10
	var side_log := CylinderMesh.new()
	side_log.top_radius = LOG_R
	side_log.bottom_radius = LOG_R
	side_log.height = DEPTH + LOG_R * 2.0
	side_log.radial_segments = 10
	for layer in layers:
		var y := LOG_R + layer * LOG_R * 2.0
		# Alternate which pair sits proud at the corners, like real notching.
		var front_out := layer % 2 == 0
		_log(root, long_log, wood, Vector3(0, y, DEPTH / 2.0), false, front_out)
		_log(root, long_log, wood, Vector3(0, y, -DEPTH / 2.0), false, front_out)
		_log(root, side_log, wood, Vector3(WIDTH / 2.0, y, 0), true, not front_out)
		_log(root, side_log, wood, Vector3(-WIDTH / 2.0, y, 0), true, not front_out)

	# Gable triangles of shortening logs on front and back.
	var gable_layers := 5
	for g in gable_layers:
		var y := WALL_H + LOG_R + g * LOG_R * 2.0
		var t := float(g) / float(gable_layers)
		var log_len: float = (WIDTH + LOG_R * 2.0) * (1.0 - t * 0.92)
		var gable_log := CylinderMesh.new()
		gable_log.top_radius = LOG_R
		gable_log.bottom_radius = LOG_R
		gable_log.height = log_len
		gable_log.radial_segments = 10
		_log(root, gable_log, wood, Vector3(0, y, DEPTH / 2.0), false, false)
		_log(root, gable_log, wood, Vector3(0, y, -DEPTH / 2.0), false, false)

	# Roof: two plank slabs meeting at the ridge, generous eaves.
	var slope := atan2(GABLE_H, DEPTH / 2.0)
	var slab_len := sqrt(pow(DEPTH / 2.0, 2) + pow(GABLE_H, 2)) + 0.55
	for side: float in [-1.0, 1.0]:
		var slab := BoxMesh.new()
		slab.size = Vector3(WIDTH + 1.1, 0.12, slab_len)
		var mi := MeshInstance3D.new()
		mi.mesh = slab
		mi.material_override = roof_mat
		mi.rotation.x = -slope * side
		var mid_z := side * (DEPTH / 4.0 + 0.1)
		mi.position = Vector3(0, WALL_H + GABLE_H / 2.0 + 0.16, mid_z)
		root.add_child(mi)

	# Door and one small window, dark recesses in the front wall.
	var door := MeshInstance3D.new()
	var door_mesh := BoxMesh.new()
	door_mesh.size = Vector3(0.95, 1.85, 0.1)
	door.mesh = door_mesh
	door.material_override = dark
	door.position = Vector3(-0.9, 0.95, DEPTH / 2.0 + LOG_R * 0.6)
	root.add_child(door)
	var window := MeshInstance3D.new()
	var win_mesh := BoxMesh.new()
	win_mesh.size = Vector3(0.7, 0.7, 0.1)
	window.mesh = win_mesh
	window.material_override = dark
	window.position = Vector3(1.4, 1.5, DEPTH / 2.0 + LOG_R * 0.6)
	root.add_child(window)
	return root

static func _log(root: Node3D, mesh: CylinderMesh, mat: Material,
		pos: Vector3, along_z: bool, proud: bool) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.rotation.z = PI / 2.0
	if along_z:
		mi.rotation.y = PI / 2.0
	if not proud:
		mi.scale = Vector3(1, 0.985, 1)
	mi.position = pos
	root.add_child(mi)

static func _wood_material(uv_scale: Vector3, tint := Color(0.72, 0.62, 0.50)) -> Material:
	var mat := StandardMaterial3D.new()
	var albedo := "res://assets/textures/wood_albedo.jpg"
	var normal := "res://assets/textures/wood_normal_gl.jpg"
	if ResourceLoader.exists(albedo):
		mat.albedo_texture = load(albedo)
	mat.albedo_color = tint
	if ResourceLoader.exists(normal):
		mat.normal_enabled = true
		mat.normal_texture = load(normal)
	mat.uv1_scale = uv_scale
	mat.roughness = 1.0
	return mat
