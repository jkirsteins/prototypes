extends Object
class_name AssetsUtil

## Resource discovery shared by main, player and grass. Exported builds list
## pck entries with .remap/.import suffixes instead of source names, so those
## are stripped and results deduplicated.

static func files_with_ext(dir_path: String, exts: Array, depth := 3) -> Array[String]:
	var out: Array[String] = []
	_collect(dir_path, exts, depth, out)
	out.sort()
	return out

static func _collect(dir_path: String, exts: Array, depth: int,
		out: Array[String]) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var f := dir.get_next()
	while f != "":
		if dir.current_is_dir():
			if depth > 0 and not f.begins_with("."):
				_collect(dir_path + "/" + f, exts, depth - 1, out)
		else:
			var trimmed := f.trim_suffix(".remap").trim_suffix(".import")
			var path := dir_path + "/" + trimmed
			if trimmed.get_extension() in exts and not out.has(path) \
					and ResourceLoader.exists(path):
				out.append(path)
		f = dir.get_next()

static func model_files(dir_path: String) -> Array[String]:
	return files_with_ext(dir_path, ["glb", "gltf"])

## First directory in the list that actually contains models - lets a
## realistic asset set shadow a stylized one without touching call sites.
static func first_model_dir(candidates: Array) -> String:
	for dir_path in candidates:
		if not model_files(dir_path).is_empty():
			return dir_path
	return ""
