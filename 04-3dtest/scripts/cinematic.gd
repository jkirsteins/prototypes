extends CanvasLayer
class_name Cinematic

## Owns the intro sequence and all screen-space dressing: click-to-begin
## overlay, fade, letterbox bars, title card, vignette, movement hint.
## The one starting click also satisfies the browser's autoplay and pointer
## lock requirements, which both need a user gesture on the web.

signal intro_finished

const TITLE_TEXT := "T Ē V Z E M E"
const SUBTITLE_TEXT := "A TALE OF THE BALTIC COUNTRYSIDE"
const BAR_RATIO := 0.13

var player: Player
var terrain: Terrain
var music: AudioStreamPlayer
var ambient: AudioStreamPlayer

var _cine_cam: Camera3D
var _fade: ColorRect
var _bar_top: ColorRect
var _bar_bottom: ColorRect
var _title: Label
var _subtitle: Label
var _hint: Label
var _start_overlay: Control
var _title_font: FontFile
var _running := false
var _skip := false

const VIGNETTE_SHADER := "
shader_type canvas_item;
uniform float strength = 0.42;
void fragment() {
	vec2 uv = UV - vec2(0.5);
	float d = length(uv * vec2(1.15, 1.0));
	float v = smoothstep(0.45, 0.95, d) * strength;
	COLOR = vec4(0.02, 0.015, 0.03, v);
}
"

func _ready() -> void:
	layer = 10
	var font_path := "res://assets/fonts/title.ttf"
	if ResourceLoader.exists(font_path):
		_title_font = load(font_path)
	_build_ui()

func _build_ui() -> void:
	var vignette := ColorRect.new()
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	var vmat := ShaderMaterial.new()
	var vshader := Shader.new()
	vshader.code = VIGNETTE_SHADER
	vmat.shader = vshader
	vignette.material = vmat
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vignette)

	_bar_top = _make_bar()
	_bar_top.anchor_bottom = 0.0
	_bar_bottom = _make_bar()
	_bar_bottom.anchor_top = 1.0

	_title = _make_label(64, Color(0.93, 0.89, 0.80))
	_title.text = TITLE_TEXT
	_subtitle = _make_label(16, Color(0.85, 0.80, 0.70))
	_subtitle.text = SUBTITLE_TEXT
	_subtitle.anchor_top = 0.60
	_subtitle.anchor_bottom = 0.60

	_hint = _make_label(17, Color(0.9, 0.88, 0.82))
	_hint.text = "W A S D  to walk      Shift  to run      Esc  to release the mouse"
	_hint.anchor_top = 0.88
	_hint.anchor_bottom = 0.88

	_fade = ColorRect.new()
	_fade.color = Color.BLACK
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_fade)

	_start_overlay = Control.new()
	_start_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	# Let the click fall through to _unhandled_input instead of being consumed.
	_start_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_start_overlay)
	var prompt := _make_label(22, Color(0.9, 0.87, 0.8))
	prompt.text = "Click to begin"
	prompt.get_parent().remove_child(prompt)
	_start_overlay.add_child(prompt)
	prompt.modulate.a = 1.0
	var pulse := create_tween().set_loops()
	pulse.tween_property(prompt, "modulate:a", 0.35, 1.4) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse.tween_property(prompt, "modulate:a", 1.0, 1.4) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _make_bar() -> ColorRect:
	var bar := ColorRect.new()
	bar.color = Color.BLACK
	bar.set_anchors_preset(Control.PRESET_FULL_RECT)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bar)
	return bar

func _make_label(size: int, color: Color) -> Label:
	var label := Label.new()
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.55))
	label.add_theme_constant_override("shadow_offset_y", 2)
	if _title_font != null:
		label.add_theme_font_override("font", _title_font)
	label.modulate.a = 0.0
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)
	return label

func _unhandled_input(event: InputEvent) -> void:
	if _start_overlay.visible:
		if event is InputEventMouseButton and event.pressed:
			_start_overlay.visible = false
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			_begin_intro()
	elif _running:
		# Deliberate inputs only - wheel ticks and synthetic events must not
		# cut the intro short.
		var key_skip: bool = event is InputEventKey and event.pressed \
			and event.keycode in [KEY_ENTER, KEY_SPACE, KEY_ESCAPE]
		var click_skip: bool = event is InputEventMouseButton and event.pressed \
			and event.button_index == MOUSE_BUTTON_LEFT
		if key_skip or click_skip:
			print("DBG skip event: ", event)
			_skip = true

func _begin_intro() -> void:
	_running = true
	_run_sequence()

func _run_sequence() -> void:
	# Cinematic camera, low in the grass looking across the meadow.
	_cine_cam = Camera3D.new()
	_cine_cam.fov = 55.0
	player.get_parent().add_child(_cine_cam)
	var p := player.global_position
	var start_pos := p + Vector3(3.5, 0.0, 7.5)
	# Start just above the grass at that spot, not relative to the player's
	# ground height - the meadow rolls, and a fixed offset can start underground.
	start_pos.y = terrain.height_at(start_pos.x, start_pos.z) + 0.45 \
		if terrain != null else p.y + 0.4
	var mid_pos := p + Vector3(2.0, 1.1, 5.2)
	var look_target := p + Vector3(0, 1.2, 0)
	_cine_cam.global_position = start_pos
	_cine_cam.look_at(look_target)
	_cine_cam.current = true

	_fade_audio(ambient, -38.0, -8.0, 5.0)

	# Rise out of the grass while the black lifts.
	var cam_tween := create_tween()
	cam_tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	cam_tween.tween_property(_cine_cam, "global_position", mid_pos, 9.0)
	cam_tween.parallel().tween_method(
		func(_t: float) -> void: _cine_cam.look_at(look_target), 0.0, 1.0, 9.0)
	create_tween().tween_property(_fade, "color:a", 0.0, 3.0)

	if await _beat(2.0): return
	if music != null and music.stream != null:
		music.volume_db = -6.0
		music.play()
	if await _beat(1.5): return

	# Title card.
	create_tween().tween_property(_title, "modulate:a", 1.0, 2.2)
	if await _beat(1.2): return
	create_tween().tween_property(_subtitle, "modulate:a", 1.0, 2.0)
	if await _beat(4.3): return
	var out := create_tween()
	out.tween_property(_title, "modulate:a", 0.0, 1.6)
	out.parallel().tween_property(_subtitle, "modulate:a", 0.0, 1.6)
	if await _beat(2.2): return

	_finish_intro()

## Waits, but reports true if the user asked to skip so the caller can bail.
func _beat(seconds: float) -> bool:
	print("DBG beat start ", seconds)
	var elapsed := 0.0
	while elapsed < seconds:
		if _skip:
			_finish_intro(true)
			return true
		await get_tree().process_frame
		elapsed += get_process_delta_time()
	print("DBG beat done ", seconds)
	return _skip

func _finish_intro(skipped := false) -> void:
	print("DBG finish_intro skipped=", skipped, " running=", _running)
	if not _running:
		return
	_running = false
	_title.modulate.a = 0.0
	_subtitle.modulate.a = 0.0
	_fade.color.a = 0.0
	if music != null and music.playing:
		_fade_audio(music, music.volume_db, -16.0, 3.0)

	# Blend the cinematic camera into the gameplay camera, retract the bars.
	var target_cam := player.camera()
	var blend := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var dur := 0.6 if skipped else 2.4
	blend.tween_property(_cine_cam, "global_transform",
		target_cam.global_transform, dur)
	blend.parallel().tween_property(_bar_top, "anchor_bottom", 0.0, dur)
	blend.parallel().tween_property(_bar_bottom, "anchor_top", 1.0, dur)
	blend.tween_callback(func() -> void:
		target_cam.current = true
		_cine_cam.queue_free()
		player.controls_enabled = true
		intro_finished.emit()
		var hint_tween := create_tween()
		hint_tween.tween_property(_hint, "modulate:a", 1.0, 1.0)
		hint_tween.tween_interval(4.0)
		hint_tween.tween_property(_hint, "modulate:a", 0.0, 1.5))

func debug_bar_rect() -> Rect2:
	return Rect2(_bar_top.global_position, _bar_top.size)

func show_letterbox_at_start() -> void:
	_bar_top.anchor_bottom = BAR_RATIO
	_bar_bottom.anchor_top = 1.0 - BAR_RATIO

func _fade_audio(stream_player: AudioStreamPlayer, from_db: float, to_db: float,
		duration: float) -> void:
	if stream_player == null or stream_player.stream == null:
		return
	stream_player.volume_db = from_db
	if not stream_player.playing:
		stream_player.play()
	create_tween().tween_property(stream_player, "volume_db", to_db, duration)
