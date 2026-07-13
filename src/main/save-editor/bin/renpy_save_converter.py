import sys
import os
import zipfile
import pickle
import io
import json
from types import ModuleType

def validate_path(path):
    base_dir = os.path.realpath(os.getcwd()) + os.sep
    canonical_path = os.path.realpath(path)
    if not canonical_path.startswith(base_dir):
        print(f"Error: Access denied to path {path}", file=sys.stderr)
        sys.exit(1)
    return canonical_path

KEY_TYPE = "$type"
KEY_CLASS = "$class"
KEY_FIELDS = "fields"
KEY_VALUES = "values"

def _init_dynamic_mock(base, instance, args, kwargs):
    if base is list:
        list.__init__(instance, *args, **kwargs)
    elif base is dict:
        dict.__init__(instance, *args, **kwargs)
    elif base is set:
        set.__init__(instance, *args, **kwargs)
    else:
        object.__init__(instance)


def _apply_dict_state(base, instance, state):
    instance.__dict__.update(state)
    if base is dict:
        instance.update(state)

def _apply_list_state(base, instance, state):
    if base is list:
        instance.extend(state)

def _apply_tuple_state(base, instance, state):
    for item in state:
        if isinstance(item, dict):
            _apply_dict_state(base, instance, item)
        elif isinstance(item, list):
            _apply_list_state(base, instance, item)

def _apply_setstate(base, instance, state):
    if isinstance(state, dict):
        _apply_dict_state(base, instance, state)
    elif isinstance(state, list):
        _apply_list_state(base, instance, state)
    elif isinstance(state, tuple):
        _apply_tuple_state(base, instance, state)
    else:
        try:
            instance.__dict__.update(state)
        except Exception:
            pass


def create_dynamic_mock(class_name, module_path):
    name_lower = class_name.lower()
    if 'list' in name_lower:
        base = list
    elif 'dict' in name_lower:
        base = dict
    elif 'set' in name_lower:
        base = set
    else:
        base = object

    class DynamicMock(base):
        def __init__(self, *args, **kwargs):
            _init_dynamic_mock(base, self, args, kwargs)

        def __setstate__(self, state):
            _apply_setstate(base, self, state)

        def __getstate__(self):
            if base is list:
                return (self.__dict__, list(self))
            elif base is dict:
                return self.__dict__
            return self.__dict__

        def __repr__(self):
            dict_part = {k: v for k, v in self.__dict__.items() if not k.startswith('_')}
            if base is list:
                return f"<MockList {class_name} list={list(self)} dict={dict_part}>"
            elif base is dict:
                return f"<MockDict {class_name} dict={dict(self)} extra={dict_part}>"
            return f"<MockObject {class_name} dict={dict_part}>"
            
    DynamicMock.__name__ = class_name
    DynamicMock.__qualname__ = class_name
    DynamicMock.__module__ = module_path
    return DynamicMock

def get_or_create_class(module_path, class_name):
    parts = module_path.split('.')
    current_module_name = ""
    for part in parts:
        if current_module_name:
            current_module_name += "." + part
        else:
            current_module_name = part
            
        if current_module_name not in sys.modules:
            sys.modules[current_module_name] = ModuleType(current_module_name)
            
    module = sys.modules[module_path]
    
    if not hasattr(module, class_name):
        mock_cls = create_dynamic_mock(class_name, module_path)
        setattr(module, class_name, mock_cls)
        
    return getattr(module, class_name)

class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        return get_or_create_class(module, name)

def serialize_val(val):
    if val is None:
        return None
    elif isinstance(val, (bool, int, float, str)):
        return val
    elif isinstance(val, list):
        return [serialize_val(x) for x in val]
    elif isinstance(val, dict):
        return {k: serialize_val(v) for k, v in val.items() if isinstance(k, str)}
    elif isinstance(val, set):
        return {
            KEY_TYPE: "set",
            KEY_VALUES: [serialize_val(x) for x in val]
        }
    elif hasattr(val, '__dict__'):
        class_name = type(val).__name__
        module_name = type(val).__module__
        return {
            KEY_TYPE: "object",
            KEY_CLASS: f"{module_name}.{class_name}",
            KEY_FIELDS: {k: serialize_val(v) for k, v in val.__dict__.items() if not k.startswith('_')}
        }
    else:
        return repr(val)

def _deserialize_list(json_val, original_val):
    if isinstance(original_val, list):
        original_val.clear()
        for idx, x in enumerate(json_val):
            original_val.append(deserialize_val(x))
        return original_val
    else:
        return [deserialize_val(x) for x in json_val]

def _deserialize_set(json_val, original_val):
    vals = json_val.get(KEY_VALUES, [])
    if isinstance(original_val, set):
        original_val.clear()
        for x in vals:
            original_val.add(deserialize_val(x))
        return original_val
    else:
        return {deserialize_val(x) for x in vals}

def _deserialize_object(json_val, original_val):
    class_path = json_val.get(KEY_CLASS)
    fields = json_val.get(KEY_FIELDS, {})
    if original_val is not None:
        for k, v in fields.items():
            orig_field = getattr(original_val, k, None)
            setattr(original_val, k, deserialize_val(v, orig_field))
        return original_val
    else:
        module_path, class_name = class_path.rsplit('.', 1)
        klass = get_or_create_class(module_path, class_name)
        obj = klass()
        for k, v in fields.items():
            setattr(obj, k, deserialize_val(v))
        return obj

def _deserialize_dict(json_val, original_val):
    if isinstance(original_val, dict):
        original_val.clear()
        for k, v in json_val.items():
            original_val[k] = deserialize_val(v)
        return original_val
    else:
        return {k: deserialize_val(v) for k, v in json_val.items()}

def deserialize_val(json_val, original_val=None):
    if json_val is None:
        return None
    elif isinstance(json_val, (bool, int, float, str)):
        return json_val
    elif isinstance(json_val, list):
        return _deserialize_list(json_val, original_val)
    elif isinstance(json_val, dict):
        t = json_val.get(KEY_TYPE)
        if t == "set":
            return _deserialize_set(json_val, original_val)
        elif t == "object":
            return _deserialize_object(json_val, original_val)
        else:
            return _deserialize_dict(json_val, original_val)
    return json_val

def to_json(save_path, json_out_path):
    save_path = validate_path(save_path)
    json_out_path = validate_path(json_out_path)
    if not os.path.exists(save_path):
        print(f"Error: Save file {save_path} does not exist", file=sys.stderr)
        sys.exit(1)
        
    with zipfile.ZipFile(save_path, 'r') as z:
        log_data = z.read('log')
        
    unpickler = SafeUnpickler(io.BytesIO(log_data))
    save_state = unpickler.load()
    
    el0 = save_state[0]
    variables = {}
    for k, v in el0.items():
        if isinstance(k, str) and k.startswith('store.'):
            variables[k] = serialize_val(v)
            
    with open(json_out_path, 'w', encoding='utf-8') as f:
        json.dump(variables, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully converted {save_path} to JSON at {json_out_path}")

def to_save(original_save_path, json_in_path, output_save_path):
    original_save_path = validate_path(original_save_path)
    json_in_path = validate_path(json_in_path)
    output_save_path = validate_path(output_save_path)
    if not os.path.exists(original_save_path):
        print(f"Error: Original save file {original_save_path} does not exist", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(json_in_path):
        print(f"Error: JSON file {json_in_path} does not exist", file=sys.stderr)
        sys.exit(1)
        
    with zipfile.ZipFile(original_save_path, 'r') as z:
        log_data = z.read('log')
        
    unpickler = SafeUnpickler(io.BytesIO(log_data))
    save_state = unpickler.load()
    el0 = save_state[0]
    
    with open(json_in_path, 'r', encoding='utf-8') as f:
        modified_vars = json.load(f)
        
    for k, v in modified_vars.items():
        if k in el0:
            el0[k] = deserialize_val(v, el0[k])
        else:
            el0[k] = deserialize_val(v)
            
    out_io = io.BytesIO()
    pickle.dump(save_state, out_io, protocol=2)
    new_log_data = out_io.getvalue()
    
    with zipfile.ZipFile(original_save_path, 'r') as z_in:
        with zipfile.ZipFile(output_save_path, 'w', zipfile.ZIP_DEFLATED) as z_out:
            for item in z_in.infolist():
                if item.filename != 'log':
                    z_out.writestr(item.filename, z_in.read(item.filename))
            z_out.writestr('log', new_log_data)
            
    print(f"Successfully generated updated save file at {output_save_path}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:", file=sys.stderr)
        print("  python renpy_save_converter.py to-json <input_save> <output_json>", file=sys.stderr)
        print("  python renpy_save_converter.py to-save <original_save> <modified_json> <output_save>", file=sys.stderr)
        sys.exit(1)
        
    cmd = sys.argv[1]
    if cmd == 'to-json':
        if len(sys.argv) != 4:
            print("Error: Invalid arguments for to-json", file=sys.stderr)
            sys.exit(1)
        to_json(sys.argv[2], sys.argv[3])
    elif cmd == 'to-save':
        if len(sys.argv) != 5:
            print("Error: Invalid arguments for to-save", file=sys.stderr)
            sys.exit(1)
        to_save(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(f"Error: Unknown command '{cmd}'", file=sys.stderr)
        sys.exit(1)
