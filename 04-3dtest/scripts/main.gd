extends Node3D

## Assembles the meadow: environment, sun, grass, scattered vegetation, cabin,
## audio, and hands the cinematic its references. Scatter classifies whatever
## GLBs the asset pass delivered by filename, so the scene degrades gracefully
## if a category is missing rather than depending on exact pack contents.

const SCATTER_SEED := 77
const PLAYER_SPAWN := Vector2(10.0, 20.0)

@onready var _terrain: Terrain = $Terrain
@onready var _player: Player = $Player
@onready var _cinematic: Cinematic = $Cinematic

var _ambient := AudioStreamPlayer.new()
var _music := AudioStreamPlayer.new()

func _ready() -> void:
	_setup_environment()
	_setup_audio()
	_place_player()
	_spawn_grass()
	_scatter_nature()
	_place_buildings()
	_cinematic.player = _player
	_cinematic.terrain = _terrain
	_cinematic.ambient = _ambient
	_cinematic.music = _music
	_cinematic.show_letterbox_at_start()
	# Temporary diagnostics for the browser console; removed before shipping.
	print("DBG grass tex exists: ", ResourceLoader.exists("res://assets/textures/grass_albedo.jpg"))
	print("DBG bar_top rect: ", _cinematic.debug_bar_rect())
	_debug_dump(_player.get_node("Model"), 0)

func _debug_dump(node: Node, depth: int) -> void:
	if depth > 6:
		return
	print("DBG model node: ", "  ".repeat(depth), node.name, " (", node.get_class(), ")")
	for child in node.get_children():
		_debug_dump(child, depth + 1)

func _setup_environment() -> void:
	var env := Environment.new()
	var hdri := _first_file("res://assets/sky", ["hdr", "exr"])
	var sky := Sky.new()
	if hdri != "":
		var pano := PanoramaSkyMaterial.new()
		pano.panorama = load(hdri)
		sky.sky_material = pano
	else:
		var proc := ProceduralSkyMaterial.new()
		proc.sky_top_color = Color(0.25, 0.32, 0.51)
		proc.sky_horizon_color = Color(0.95, 0.62, 0.36)
		proc.sky_curve = 0.12
		proc.ground_bottom_color = Color(0.12, 0.10, 0.08)
		proc.ground_horizon_color = Color(0.86, 0.58, 0.35)
		proc.sun_angle_max = 30.0
		proc.sun_curve = 0.08
		sky.sky_material = proc
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 1.0
	# The golden-hour HDRI is bright; ambient above ~0.5 washes the whole
	# meadow toward white (it read as snow in the first browser pass).
	env.ambient_light_energy = 0.4
	# The HDRI's blown-out sky also floods every surface via specular sky
	# reflections (the wash survives any ambient_light_energy value); kill them.
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_white = 6.0
	env.fog_enabled = true
	env.fog_light_color = Color(0.87, 0.70, 0.50)
	env.fog_density = 0.007
	env.fog_sky_affect = 0.12
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.05
	env.adjustment_saturation = 1.1
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_color = Color(1.0, 0.78, 0.52)
	sun.light_energy = 1.15
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90.0
	sun.shadow_blur = 1.5
	# Low in the south-west: long shadows, light in the player's face on spawn.
	sun.rotation_degrees = Vector3(-11.0, 130.0, 0.0)
	add_child(sun)

func _setup_audio() -> void:
	_ambient.name = "AmbientAudio"
	_music.name = "MusicAudio"
	add_child(_ambient)
	add_child(_music)
	var ambient_path := _existing_audio("res://assets/audio/ambient_meadow")
	if ambient_path != "":
		_ambient.stream = load(ambient_path)
		_set_looping(_ambient.stream)
	var music_path := _existing_audio("res://assets/audio/title_theme")
	if music_path != "":
		_music.stream = load(music_path)
		_set_looping(_music.stream)

func _set_looping(stream: AudioStream) -> void:
	if stream is AudioStreamOggVorbis:
		stream.loop = true
	elif stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_end = stream.data.size() / 2

func _existing_audio(base: String) -> String:
	for ext in ["ogg", "wav"]:
		if ResourceLoader.exists(base + "." + ext):
			return base + "." + ext
	return ""

func _place_player() -> void:
	var x := PLAYER_SPAWN.x
	var z := PLAYER_SPAWN.y
	_player.position = Vector3(x, _terrain.height_at(x, z) + 0.1, z)
	# Face the cabin at the center of the clearing.
	_player.get_node("Model").rotation.y = atan2(-x, -z)

func _spawn_grass() -> void:
	var grass := GrassField.new()
	grass.terrain = _terrain
	add_child(grass)

func _scatter_nature() -> void:
	var files := _glb_files("res://assets/nature")
	var trees: Array[String] = []
	var bushes: Array[String] = []
	var rocks: Array[String] = []
	var flowers: Array[String] = []
	for f in files:
		var lower := f.get_file().to_lower()
		if lower.contains("tree") or lower.contains("birch") or lower.contains("pine") \
				or lower.contains("spruce") or lower.contains("fir"):
			trees.append(f)
		elif lower.contains("bush") or lower.contains("shrub"):
			bushes.append(f)
		elif lower.contains("rock") or lower.contains("stone") or lower.contains("boulder"):
			rocks.append(f)
		elif lower.contains("flower"):
			flowers.append(f)
	var rng := RandomNumberGenerator.new()
	rng.seed = SCATTER_SEED
	# Kenney models are ~toy scale (a tall pine is 1.9 units), hence the 4-5x.
	_scatter_set(rng, trees, 180, 32.0, 96.0, Vector2(3.6, 5.6), true, 0.5)
	_scatter_set(rng, bushes, 70, 24.0, 85.0, Vector2(2.2, 3.6), false, 0.0)
	_scatter_set(rng, rocks, 28, 18.0, 90.0, Vector2(1.8, 4.0), false, 0.0)
	_scatter_set(rng, flowers, 130, 6.0, 45.0, Vector2(2.4, 3.4), false, 0.0)

## Scatters scenes in an annulus around the center. bias_outward pushes samples
## toward the outer radius so trees thicken into a forest edge.
func _scatter_set(rng: RandomNumberGenerator, paths: Array[String], count: int,
		r_min: float, r_max: float, scale_range: Vector2,
		bias_outward: bool, collider_radius: float) -> void:
	if paths.is_empty():
		return
	var scenes: Array[PackedScene] = []
	for p in paths:
		scenes.append(load(p))
	for i in count:
		var t := rng.randf()
		if bias_outward:
			t = 1.0 - (1.0 - t) * (1.0 - t)
		var r: float = lerpf(r_min, r_max, t)
		var a := rng.randf() * TAU
		var x := cos(a) * r
		var z := sin(a) * r
		# Keep the player's intro sightline toward the cabin clear.
		if Vector2(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.y).length() < 6.0:
			continue
		var pick := rng.randi() % scenes.size()
		var inst: Node3D = scenes[pick].instantiate()
		inst.position = Vector3(x, _terrain.height_at(x, z) - 0.05, z)
		inst.rotation.y = rng.randf() * TAU
		inst.scale = Vector3.ONE * rng.randf_range(scale_range.x, scale_range.y)
		add_child(inst)
		var picked_name := paths[pick].get_file().to_lower()
		if picked_name.contains("tree_default") or picked_name.contains("tree_thin"):
			_birchify(inst)
		if collider_radius > 0.0:
			var body := StaticBody3D.new()
			var shape := CollisionShape3D.new()
			var cyl := CylinderShape3D.new()
			cyl.radius = collider_radius * inst.scale.x * 0.35
			cyl.height = 6.0
			shape.shape = cyl
			shape.position = Vector3(0, 3, 0)
			body.add_child(shape)
			inst.add_child(body)

func _place_buildings() -> void:
	var files := _glb_files("res://assets/buildings")
	var cabin_path := ""
	var fence_path := ""
	for f in files:
		var lower := f.get_file().to_lower()
		if cabin_path == "" and (lower.contains("cabin") or lower.contains("house")
				or lower.contains("hut") or lower.contains("cottage")):
			cabin_path = f
		elif fence_path == "" and lower.contains("fence"):
			fence_path = f
	if cabin_path != "":
		var cabin: Node3D = (load(cabin_path) as PackedScene).instantiate()
		var h := _terrain.height_at(0.0, 0.0)
		cabin.position = Vector3(0, h - 0.05, 0)
		# KayKit models are toy scale: 5x makes the 0.8-unit house a cottage.
		cabin.scale = Vector3.ONE * 5.0
		# Door roughly toward the player spawn.
		cabin.rotation.y = atan2(PLAYER_SPAWN.x, PLAYER_SPAWN.y)
		add_child(cabin)
		_add_box_collider(cabin)
	if fence_path != "":
		var fence_scene: PackedScene = load(fence_path)
		# A 1.16-unit segment at 3x is ~3.5 m; at radius 14 that subtends ~14.5
		# degrees, so consecutive segments meet end to end around the arc.
		for i in 8:
			var a := deg_to_rad(140.0 + i * 14.5)
			var r := 14.0
			var x := cos(a) * r
			var z := sin(a) * r
			var wrapper := Node3D.new()
			wrapper.position = Vector3(x, _terrain.height_at(x, z) - 0.02, z)
			wrapper.rotation.y = -a + PI / 2.0
			wrapper.scale = Vector3.ONE * 3.0
			var seg: Node3D = fence_scene.instantiate()
			# The pack's fence geometry sits ~1 unit off its pivot; re-center.
			seg.position = Vector3(1.0, 0.0, 0.0)
			wrapper.add_child(seg)
			add_child(wrapper)

## Kenney's deciduous trees share a brown "woodBark" material; overriding the
## trunk surfaces to chalk white turns them into passable birches.
func _birchify(root: Node) -> void:
	if root is MeshInstance3D:
		var mi := root as MeshInstance3D
		for s in mi.mesh.get_surface_count():
			var mat := mi.get_active_material(s)
			if mat != null and (mat.resource_name.to_lower().contains("bark")
					or mat.resource_name.to_lower().contains("wood")):
				var birch := StandardMaterial3D.new()
				birch.albedo_color = Color(0.88, 0.87, 0.80)
				birch.roughness = 1.0
				mi.set_surface_override_material(s, birch)
	for child in root.get_children():
		_birchify(child)

## Approximates a static collider from the union of the scene's visual AABBs.
func _add_box_collider(root: Node3D) -> void:
	var aabb := _combined_aabb(root, root)
	if aabb.size == Vector3.ZERO:
		return
	var body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = aabb.size
	shape.shape = box
	shape.position = aabb.get_center()
	body.add_child(shape)
	root.add_child(body)

func _combined_aabb(node: Node, root: Node3D) -> AABB:
	var aabb := AABB()
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var xform := root.global_transform.affine_inverse() * mi.global_transform \
			if mi.is_inside_tree() else mi.transform
		aabb = xform * mi.get_aabb()
	for child in node.get_children():
		var child_aabb := _combined_aabb(child, root)
		if child_aabb.size != Vector3.ZERO:
			aabb = aabb.merge(child_aabb) if aabb.size != Vector3.ZERO else child_aabb
	return aabb

## Lists resources by extension. Exported builds list pck entries with .remap
## or .import suffixes instead of the source names, so those are stripped and
## the result deduplicated; ResourceLoader.exists confirms loadability.
func _files_with_ext(dir_path: String, exts: Array) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return out
	dir.list_dir_begin()
	var f := dir.get_next()
	while f != "":
		if not dir.current_is_dir():
			var trimmed := f.trim_suffix(".remap").trim_suffix(".import")
			var path := dir_path + "/" + trimmed
			if trimmed.get_extension() in exts and not out.has(path) \
					and ResourceLoader.exists(path):
				out.append(path)
		f = dir.get_next()
	return out

func _glb_files(dir_path: String) -> Array[String]:
	return _files_with_ext(dir_path, ["glb", "gltf"])

func _first_file(dir_path: String, exts: Array) -> String:
	var found := _files_with_ext(dir_path, exts)
	return found[0] if not found.is_empty() else ""
