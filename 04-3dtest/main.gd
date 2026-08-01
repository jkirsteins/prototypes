extends Node3D

## Degrees per second the cube turns on each axis. A still cube cannot tell you
## whether the frame loop is running, so hello world spins.
@export var spin_degrees_per_second := Vector2(45.0, 22.0)

@onready var _cube: MeshInstance3D = $Cube

func _process(delta: float) -> void:
	_cube.rotate_y(deg_to_rad(spin_degrees_per_second.x) * delta)
	_cube.rotate_x(deg_to_rad(spin_degrees_per_second.y) * delta)
