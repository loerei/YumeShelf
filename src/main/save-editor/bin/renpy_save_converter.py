import sys
import os
import zipfile
import pickle
import pickletools
import struct
import io
import json
import base64
from types import ModuleType

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
    
    if hasattr(module, class_name):
        return getattr(module, class_name)

    name_lower = class_name.lower()
    if 'list' in name_lower or class_name == 'RevertableList':
        base = list
    elif 'dict' in name_lower or class_name == 'RevertableDict':
        base = dict
    elif 'set' in name_lower or class_name == 'RevertableSet':
        base = set
    else:
        base = object

    class DynamicMock(base):
        def __new__(cls, *args, **kwargs):
            return super().__new__(cls)

        def __init__(self, *args, **kwargs):
            if base is list:
                list.__init__(self, *args, **kwargs)
            elif base is dict:
                dict.__init__(self, *args, **kwargs)
            elif base is set:
                set.__init__(self, *args, **kwargs)
            else:
                object.__init__(self)
                
        def __setstate__(self, state):
            if isinstance(state, dict):
                self.__dict__.update(state)
                if base is dict:
                    self.update(state)
            elif isinstance(state, tuple):
                for item in state:
                    if isinstance(item, dict):
                        self.__dict__.update(item)
                        if base is dict:
                            self.update(item)
                    elif isinstance(item, list) and base is list:
                        self.extend(item)
            elif isinstance(state, list):
                if base is list:
                    self.extend(state)
            else:
                try:
                    self.__dict__.update(state)
                except Exception:
                    pass
                
        def __getstate__(self):
            if base is dict:
                return dict(self)
            elif base is list:
                return (self.__dict__, list(self))
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
    setattr(module, class_name, DynamicMock)
        
    return getattr(module, class_name)

class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        return get_or_create_class(module, name)

TYPE_KEY = "$type"

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
            TYPE_KEY: "set",
            "values": [serialize_val(x) for x in val]
        }
    elif hasattr(val, '__dict__'):
        class_name = type(val).__name__
        module_name = type(val).__module__
        return {
            TYPE_KEY: "object",
            "$class": f"{module_name}.{class_name}",
            "fields": {k: serialize_val(v) for k, v in val.__dict__.items() if not k.startswith('_')}
        }
    else:
        return repr(val)

def to_json(save_path, json_out_path):
    if not os.path.exists(save_path):
        print(f"Error: Save file {save_path} does not exist", file=sys.stderr)
        sys.exit(1)
        
    with zipfile.ZipFile(save_path, 'r') as z:
        log_data = z.read('log')
        
    unpickler = SafeUnpickler(io.BytesIO(log_data))
    save_state = unpickler.load()
    
    el0 = save_state[0] if isinstance(save_state, (tuple, list)) and len(save_state) > 0 else {}
    variables = {}
    for k, v in el0.items():
        if isinstance(k, str) and k.startswith('store.'):
            variables[k] = serialize_val(v)
            
    with open(json_out_path, 'w', encoding='utf-8') as f:
        json.dump(variables, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully converted {save_path} to JSON at {json_out_path}")

def encode_pickle_value(val, old_op_name=None):
    if val is None:
        return b'\x4e'  # NONE
    elif isinstance(val, bool):
        return b'\x88' if val else b'\x89'  # NEWTRUE / NEWFALSE
    elif isinstance(val, int):
        if old_op_name == 'BININT2' and 0 <= val <= 65535:
            return b'\x4d' + val.to_bytes(2, 'little')
        elif old_op_name == 'BININT' and -2147483648 <= val <= 2147483647:
            return b'\x4a' + val.to_bytes(4, 'little', signed=True)
        elif 0 <= val <= 255:
            return b'\x4b' + bytes([val])  # BININT1
        elif 0 <= val <= 65535:
            return b'\x4d' + val.to_bytes(2, 'little')  # BININT2
        elif -2147483648 <= val <= 2147483647:
            return b'\x4a' + val.to_bytes(4, 'little', signed=True)  # BININT
        else:
            raw = val.to_bytes((val.bit_length() + 7) // 8, 'little', signed=True)
            return b'\x8a' + bytes([len(raw)]) + raw  # LONG1
    elif isinstance(val, float):
        return b'\x47' + struct.pack('>d', val)  # BINFLOAT
    elif isinstance(val, str):
        utf8 = val.encode('utf-8')
        if len(utf8) <= 255:
            return b'\x8c' + bytes([len(utf8)]) + utf8  # SHORT_BINUNICODE
        elif len(utf8) <= 4294967295:
            return b'\x8d' + len(utf8).to_bytes(4, 'little') + utf8  # BINUNICODE
        else:
            return b'\x8e' + len(utf8).to_bytes(8, 'little') + utf8  # BINUNICODE8
    return None

def patch_log_stream(log_data, modified_vars):
    try:
        unpickler = SafeUnpickler(io.BytesIO(log_data))
        save_state = unpickler.load()
        orig_vars = save_state[0] if isinstance(save_state, (tuple, list)) and len(save_state) > 0 else {}
    except Exception as e:
        print(f"[WARN] Failed to unpickle original state for diff detection: {e}", file=sys.stderr)
        orig_vars = {}

    changed = {}
    for k, v in modified_vars.items():
        if k in orig_vars and orig_vars[k] != v:
            changed[k] = v
        elif k not in orig_vars:
            changed[k] = v

    if not changed:
        print("No store variables changed.")
        return log_data

    # Walk and collect all frame descriptors in the stream (Pickle Protocol 4 / 5)
    pos = 0
    if log_data.startswith(b'\x80\x05') or log_data.startswith(b'\x80\x04'):
        pos = 2

    frames = []
    while pos < len(log_data) and log_data[pos] == 0x95:
        frame_len = int.from_bytes(log_data[pos+1:pos+9], 'little')
        frames.append({
            'header_pos': pos,
            'length': frame_len,
            'payload_start': pos + 9,
            'payload_end': pos + 9 + frame_len,
            'delta': 0
        })
        pos = pos + 9 + frame_len

    ops = list(pickletools.genops(log_data))
    entries = {}
    for i, (op, arg, pos_op) in enumerate(ops):
        if isinstance(arg, str) and (arg.startswith('store.') or arg in changed):
            val_idx = i + 1
            while val_idx < len(ops) and ops[val_idx][0].name == 'MEMOIZE':
                val_idx += 1
            if val_idx < len(ops):
                val_op, val_arg, val_pos = ops[val_idx]
                next_idx = val_idx + 1
                if next_idx < len(ops):
                    next_pos = ops[next_idx][2]
                else:
                    next_pos = len(log_data)
                entries[arg] = (val_pos, next_pos, val_op.name, val_arg)

    replacements = []
    for key, new_val in changed.items():
        if key in entries:
            start, end, old_op, old_arg = entries[key]
            encoded = encode_pickle_value(new_val, old_op_name=old_op)
            if encoded is not None:
                replacements.append((start, end, encoded))
                print(f"Surgical patch on {key}: {orig_vars.get(key, old_arg)} -> {new_val} (opcode: {encoded.hex()})")

    # Map delta changes to corresponding frames
    for start, end, new_bytes in replacements:
        delta = len(new_bytes) - (end - start)
        for f in frames:
            if f['payload_start'] <= start <= f['payload_end']:
                f['delta'] += delta
                break

    # Sort replacements by start pos descending to ensure upstream offsets remain valid
    replacements.sort(key=lambda x: x[0], reverse=True)
    buf = bytearray(log_data)
    for start, end, new_bytes in replacements:
        buf[start:end] = new_bytes

    # Apply Frame Length Compensation across all frames
    if frames:
        cum_delta = 0
        for f in frames:
            current_header_pos = f['header_pos'] + cum_delta
            new_frame_len = f['length'] + f['delta']
            buf[current_header_pos + 1 : current_header_pos + 9] = new_frame_len.to_bytes(8, 'little')
            cum_delta += f['delta']

    return bytes(buf)

def get_renpy_token_path():
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA', '')
        if appdata:
            return os.path.join(appdata, 'RenPy', 'tokens', 'security_keys.txt')
    elif sys.platform == 'darwin':
        return os.path.expanduser('~/Library/RenPy/tokens/security_keys.txt')
    else:
        return os.path.expanduser('~/.renpy/tokens/security_keys.txt')
    return None

def sign_log_data(log_data):
    token_path = get_renpy_token_path()
    if not token_path or not os.path.exists(token_path):
        return None

    priv_b64, pub_b64 = None, None
    try:
        with open(token_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) == 3 and parts[0] == 'signing-key':
                    priv_b64, pub_b64 = parts[1], parts[2]
                    break
    except Exception as e:
        print(f"[WARN] Failed to read security_keys.txt: {e}", file=sys.stderr)
        return None

    if not priv_b64 or not pub_b64:
        return None

    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

        priv_der = base64.b64decode(priv_b64)
        priv_key = serialization.load_der_private_key(priv_der, password=None)
        der_sig = priv_key.sign(log_data, ec.ECDSA(hashes.SHA1()))
        r, s = decode_dss_signature(der_sig)
        raw_sig = r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
        sig_b64 = base64.b64encode(raw_sig).decode('ascii')
        return f"signature {pub_b64} {sig_b64}\n".encode('utf-8')
    except Exception as e:
        try:
            import ecdsa
            priv_der = base64.b64decode(priv_b64)
            sk = ecdsa.SigningKey.from_der(priv_der)
            sig_raw = sk.sign(log_data)
            sig_b64 = base64.b64encode(sig_raw).decode('ascii')
            return f"signature {pub_b64} {sig_b64}\n".encode('utf-8')
        except Exception as e2:
            print(f"[WARN] Failed to sign save data: {e} / {e2}", file=sys.stderr)
            return None

def to_save(original_save_path, json_in_path, output_save_path):
    if not os.path.exists(original_save_path):
        print(f"Error: Original save file {original_save_path} does not exist", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(json_in_path):
        print(f"Error: JSON file {json_in_path} does not exist", file=sys.stderr)
        sys.exit(1)
        
    with zipfile.ZipFile(original_save_path, 'r') as z:
        orig_log_data = z.read('log')
        
    with open(json_in_path, 'r', encoding='utf-8') as f:
        modified_vars = json.load(f)
        
    new_log_data = patch_log_stream(orig_log_data, modified_vars)
    new_signatures = sign_log_data(new_log_data)
    
    with zipfile.ZipFile(original_save_path, 'r') as z_in:
        with zipfile.ZipFile(output_save_path, 'w', zipfile.ZIP_DEFLATED) as z_out:
            has_signatures_written = False
            for item in z_in.infolist():
                if item.filename == 'log':
                    z_out.writestr('log', new_log_data)
                elif item.filename == 'signatures' and new_signatures is not None:
                    z_out.writestr('signatures', new_signatures)
                    has_signatures_written = True
                else:
                    z_out.writestr(item.filename, z_in.read(item.filename))
            if new_signatures is not None and not has_signatures_written:
                z_out.writestr('signatures', new_signatures)
            
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
