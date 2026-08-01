extends CharacterBody3D
class_name Player

## Third-person controller for the KayKit character. Animations are in-place,
## so all movement is driven here; the AnimationPlayer only picks clips.

const WALK_SPEED := 2.4
const RUN_SPEED := 5.2
const ACCEL := 10.0
const GRAVITY := 18.0
const TURN_SPEED := 10.0          # model yaw catch-up, rad/s-ish (lerp factor)
const MOUSE_SENSITIVITY := 0.0028
const PITCH_MIN := -1.1
const PITCH_MAX := 0.5
const WALK_STEP_LENGTH := 0.95    # meters of travel per footstep sound
const RUN_STEP_LENGTH := 2.0

## Accessory meshes on the GLB to hide for a plain villager look.
const HIDDEN_ACCESSORIES := ["1H_Axe", "1H_Axe_Offhand", "2H_Axe", "Barbarian_Round_Shield", "Mug"]

var controls_enabled := false

var _anim: AnimationPlayer
var _anim_names := {}             # logical name -> real (possibly namespaced) name
var _model: Node3D
var _rig: Node3D
var _arm: SpringArm3D
var _camera: Camera3D
var _step_accum := 0.0
var _footsteps: Array[AudioStream] = []
var _sfx: AudioStreamPlayer3D

func _ready() -> void:
	_model = get_node_or_null("Model")
	_rig = $CameraRig
	_arm = $CameraRig/SpringArm3D
	_camera = $CameraRig/SpringArm3D/Camera3D
	_sfx = AudioStreamPlayer3D.new()
	_sfx.max_distance = 30.0
	add_child(_sfx)
	_load_footsteps()
	if _model != null:
		_setup_model()

func _setup_model() -> void:
	_anim = _find_anim_player(_model)
	if _anim != null:
		for logical in ["Idle", "Walking_A", "Running_A"]:
			_anim_names[logical] = _resolve_anim(logical)
		_play_anim("Idle")
	for acc in HIDDEN_ACCESSORIES:
		var node := _model.find_child(acc, true, false)
		if node is Node3D:
			node.visible = false

func _find_anim_player(root: Node) -> AnimationPlayer:
	if root is AnimationPlayer:
		return root
	for child in root.get_children():
		var found := _find_anim_player(child)
		if found != null:
			return found
	return null

## Import may namespace clip names ("Barbarian/Idle"); match by suffix.
func _resolve_anim(logical: String) -> String:
	if _anim.has_animation(logical):
		return logical
	for anim_name in _anim.get_animation_list():
		if anim_name.ends_with("/" + logical) or anim_name == logical:
			return anim_name
	push_warning("Animation not found: " + logical)
	return ""

func _play_anim(logical: String, blend := 0.25) -> void:
	if _anim == null:
		return
	var real: String = _anim_names.get(logical, "")
	if real != "" and _anim.current_animation != real:
		_anim.play(real, blend)

func _load_footsteps() -> void:
	for i in range(1, 9):
		for ext in ["ogg", "wav"]:
			var path := "res://assets/audio/footstep_grass_%02d.%s" % [i, ext]
			if ResourceLoader.exists(path):
				_footsteps.append(load(path))

func _unhandled_input(event: InputEvent) -> void:
	if not controls_enabled:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_rig.rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
		_arm.rotation.x = clampf(_arm.rotation.x - event.relative.y * MOUSE_SENSITIVITY,
			PITCH_MIN, PITCH_MAX)
	elif event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseButton and event.pressed \
			and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	var input_dir := Vector2.ZERO
	if controls_enabled:
		input_dir = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var running := controls_enabled and Input.is_action_pressed("run")
	var speed := RUN_SPEED if running else WALK_SPEED
	var direction := (_rig.global_transform.basis * Vector3(input_dir.x, 0, input_dir.y))
	direction.y = 0.0
	direction = direction.normalized() * input_dir.length()
	var target := direction * speed
	velocity.x = move_toward(velocity.x, target.x, ACCEL * delta * speed)
	velocity.z = move_toward(velocity.z, target.z, ACCEL * delta * speed)
	move_and_slide()

	var planar := Vector2(velocity.x, velocity.z)
	if planar.length() > 0.3 and _model != null:
		# glTF characters face +Z, so yaw aligns +Z with the velocity direction.
		var target_yaw := atan2(velocity.x, velocity.z)
		_model.rotation.y = lerp_angle(_model.rotation.y, target_yaw,
			minf(TURN_SPEED * delta, 1.0))
	if planar.length() > 0.3:
		_play_anim("Running_A" if running else "Walking_A")
		if is_on_floor():
			_step_accum += planar.length() * delta
			var step_len := RUN_STEP_LENGTH if running else WALK_STEP_LENGTH
			if _step_accum >= step_len:
				_step_accum = 0.0
				_play_footstep()
	else:
		_play_anim("Idle", 0.35)
		_step_accum = 0.0

func _play_footstep() -> void:
	if _footsteps.is_empty():
		return
	_sfx.stream = _footsteps.pick_random()
	_sfx.pitch_scale = randf_range(0.9, 1.12)
	_sfx.volume_db = randf_range(-14.0, -11.0)
	_sfx.play()

func camera() -> Camera3D:
	return _camera
