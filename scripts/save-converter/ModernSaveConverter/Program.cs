using System;
using System.IO;
using System.Reflection;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Formatters.Binary;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Text.Json;
using System.Linq;
using ICSharpCode.Decompiler;
using ICSharpCode.Decompiler.CSharp;
using ICSharpCode.Decompiler.Metadata;
using ICSharpCode.Decompiler.TypeSystem;

#pragma warning disable SYSLIB0011 // BinaryFormatter is obsolete

[Serializable]
public class DummyStringComparer : IEqualityComparer<string>, ISerializable
{
    public bool Equals(string? x, string? y)
    {
        return string.Equals(x, y);
    }

    public int GetHashCode(string obj)
    {
        return obj?.GetHashCode() ?? 0;
    }

    public DummyStringComparer() {}

    protected DummyStringComparer(SerializationInfo info, StreamingContext context) {}

    public void GetObjectData(SerializationInfo info, StreamingContext context) {}
}

class LoggingBinder : SerializationBinder
{
    public override Type BindToType(string assemblyName, string typeName)
    {
        if (typeName.Contains("InternalStringComparer"))
        {
            Console.WriteLine($"[BINDER] Redirected Mono InternalStringComparer to DummyStringComparer");
            return typeof(DummyStringComparer);
        }

        // Forward default standard resolutions
        try
        {
            Type? t = Type.GetType($"{typeName}, {assemblyName}");
            if (t != null) return t;
        }
        catch {}

        // Fallback search in loaded assemblies
        foreach (Assembly asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            string asmName = asm.GetName().Name ?? "";
            if (asmName == new AssemblyName(assemblyName).Name)
            {
                Type? t = asm.GetType(typeName);
                if (t != null) return t;
            }
        }

        // Just let BinaryFormatter handle it normally
        return null!;
    }
}

class Program
{
    static string dllPath = "";

    static void Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.WriteLine("Usage: ModernSaveConverter <to-json|to-bin|inspect|decompile> <dll-path> [args...]");
            return;
        }

        string action = args[0].ToLower();

        if (action == "inspect")
        {
            dllPath = args[1];
            InspectDll(dllPath);
            return;
        }

        if (action == "decompile")
        {
            dllPath = args[1];
            string typeName = args.Length > 2 ? args[2] : "GameGflagMap";
            DecompileType(dllPath, typeName);
            return;
        }

        if (args.Length < 4)
        {
            Console.WriteLine("Usage: ModernSaveConverter <to-json|to-bin> <dll-path> <bin-path> <json-path>");
            return;
        }

        dllPath = args[1];
        string binPath = args[2];
        string jsonPath = args[3];

        AppDomain.CurrentDomain.AssemblyResolve += ResolveAssembly;

        try
        {
            if (action == "to-json")
            {
                ToJson(binPath, jsonPath);
            }
            else if (action == "to-bin")
            {
                ToBin(binPath, jsonPath);
            }
            else
            {
                Console.WriteLine("Unknown action: " + action);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("[ERROR] " + ex.ToString());
        }
    }

    static void DecompileType(string dllPath, string typeName)
    {
        Console.WriteLine($"Decompiling type: {typeName} from assembly {dllPath}");
        try
        {
            var decompiler = new CSharpDecompiler(dllPath, new DecompilerSettings());
            var code = decompiler.DecompileTypeAsString(new FullTypeName(typeName));
            Console.WriteLine("\n--- DECOMPILED CODE ---");
            Console.WriteLine(code);
        }
        catch (Exception ex)
        {
            Console.WriteLine("[DECOMPILE ERROR] " + ex.ToString());
        }
    }

    static void InspectDll(string dllPath)
    {
        Console.WriteLine("Loading assembly: " + dllPath);
        Assembly assembly = Assembly.LoadFrom(dllPath);

        Console.WriteLine("\n--- Searching for Save/Load/File/Flag Classes and Members ---");
        var types = assembly.GetTypes();

        foreach (var type in types)
        {
            bool match = type.Name.Contains("Save", StringComparison.OrdinalIgnoreCase) ||
                         type.Name.Contains("Load", StringComparison.OrdinalIgnoreCase) ||
                         type.Name.Contains("File", StringComparison.OrdinalIgnoreCase) ||
                         type.Name.Contains("Game", StringComparison.OrdinalIgnoreCase) ||
                         type.Name.Contains("Setting", StringComparison.OrdinalIgnoreCase) ||
                         type.Name.Contains("Flag", StringComparison.OrdinalIgnoreCase);

            if (match)
            {
                Console.WriteLine($"\n[CLASS] {type.FullName}");
                
                // Fields
                var fields = type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
                foreach (var field in fields)
                {
                    if (field.Name.Contains("save", StringComparison.OrdinalIgnoreCase) ||
                        field.Name.Contains("file", StringComparison.OrdinalIgnoreCase) ||
                        field.Name.Contains("path", StringComparison.OrdinalIgnoreCase) ||
                        field.Name.Contains("info", StringComparison.OrdinalIgnoreCase) ||
                        field.Name.Contains("flag", StringComparison.OrdinalIgnoreCase) ||
                        field.Name.Contains("finfo", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine($"  - [FIELD] {field.FieldType.Name} {field.Name}");
                    }
                }

                // Methods
                var methods = type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly);
                foreach (var method in methods)
                {
                    if (method.Name.Contains("Save", StringComparison.OrdinalIgnoreCase) ||
                        method.Name.Contains("Load", StringComparison.OrdinalIgnoreCase) ||
                        method.Name.Contains("File", StringComparison.OrdinalIgnoreCase) ||
                        method.Name.Contains("Read", StringComparison.OrdinalIgnoreCase) ||
                        method.Name.Contains("Write", StringComparison.OrdinalIgnoreCase) ||
                        method.Name.Contains("Decrypt", StringComparison.OrdinalIgnoreCase) ||
                        method.Name.Contains("Encrypt", StringComparison.OrdinalIgnoreCase) ||
                        method.Name.Contains("Flag", StringComparison.OrdinalIgnoreCase))
                    {
                        var parameters = string.Join(", ", method.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"));
                        Console.WriteLine($"  - [METHOD] {method.ReturnType.Name} {method.Name}({parameters})");
                    }
                }
            }
        }
    }

    static Assembly? ResolveAssembly(object? sender, ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name ?? "";
        if (name == "Assembly-CSharp")
        {
            return Assembly.LoadFrom(dllPath);
        }

        string? parentDir = Path.GetDirectoryName(dllPath);
        if (parentDir != null)
        {
            string expectedPath = Path.Combine(parentDir, name + ".dll");
            if (File.Exists(expectedPath))
            {
                return Assembly.LoadFrom(expectedPath);
            }
        }
        
        return null;
    }

    static uint GetUint32(byte[] buf, int off)
    {
        return (uint)(buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24));
    }

    static void PutUint32(uint v, byte[] buf, int off)
    {
        buf[off] = (byte)(v & 0xFF);
        buf[off + 1] = (byte)((v >> 8) & 0xFF);
        buf[off + 2] = (byte)((v >> 16) & 0xFF);
        buf[off + 3] = (byte)((v >> 24) & 0xFF);
    }

    static void ToJson(string binPath, string jsonPath)
    {
        if (Path.GetFileName(binPath).Contains("finfo", StringComparison.OrdinalIgnoreCase))
        {
            FinfoToJson(binPath, jsonPath);
            return;
        }

        byte[] bytes = File.ReadAllBytes(binPath);
        using (MemoryStream ms = new MemoryStream(bytes))
        {
            BinaryFormatter formatter = new BinaryFormatter();
            formatter.Binder = new LoggingBinder();
            object obj = formatter.Deserialize(ms);
            
            string json = SerializeObject(obj);
            File.WriteAllText(jsonPath, json, Encoding.UTF8);
            Console.WriteLine("[SUCCESS] Converted " + binPath + " to " + jsonPath);
        }
    }

    static void ToBin(string binPath, string jsonPath)
    {
        if (Path.GetFileName(binPath).Contains("finfo", StringComparison.OrdinalIgnoreCase))
        {
            JsonToFinfo(binPath, jsonPath);
            return;
        }

        object obj;
        byte[] bytes = File.ReadAllBytes(binPath);
        using (MemoryStream ms = new MemoryStream(bytes))
        {
            BinaryFormatter formatter = new BinaryFormatter();
            formatter.Binder = new LoggingBinder();
            obj = formatter.Deserialize(ms);
        }

        string jsonStr = File.ReadAllText(jsonPath, Encoding.UTF8);
        var jsonDict = JsonSerializer.Deserialize<Dictionary<string, object>>(jsonStr);

        if (jsonDict != null)
        {
            UpdateObject(obj, jsonDict);
        }

        using (FileStream fs = File.Create(binPath))
        {
            BinaryFormatter formatter = new BinaryFormatter();
            formatter.Binder = new LoggingBinder();
            formatter.Serialize(fs, obj);
        }
        Console.WriteLine("[SUCCESS] Converted " + jsonPath + " to " + binPath);
    }

    static void FinfoToJson(string binPath, string jsonPath)
    {
        byte[] rawBytes = File.ReadAllBytes(binPath);
        if (rawBytes.Length < 8)
        {
            throw new Exception("File too short");
        }
        
        int num = (int)GetUint32(rawBytes, 0) ^ -746806706;
        if (num < 8 || num > rawBytes.Length)
        {
            throw new Exception($"File length error. Header says: {num}, Actual bytes: {rawBytes.Length}");
        }

        byte[] decBytes = (byte[])rawBytes.Clone();
        uint num3 = 2369738012u;
        for (int i = 4; i < num; i++)
        {
            decBytes[i] ^= (byte)(num3 & 0xFF);
            num3 = ((num3 << 3) + 16701) ^ (num3 >> 16);
        }

        int num2 = 4;
        int count = (int)GetUint32(decBytes, num2);
        num2 += 4;

        var flagsList = new List<string>();
        for (int j = 0; j < count; j++)
        {
            int nlen = (int)GetUint32(decBytes, num2);
            num2 += 4;
            
            string key = Encoding.UTF8.GetString(decBytes, num2, nlen);
            num2 += nlen;
            flagsList.Add(key);
        }

        var result = new Dictionary<string, object>
        {
            { "$type", "GameGflagMapInfo" },
            { "flag_map", flagsList }
        };

        var options = new JsonSerializerOptions { WriteIndented = true };
        string json = JsonSerializer.Serialize(result, options);
        File.WriteAllText(jsonPath, json, Encoding.UTF8);
        Console.WriteLine("[SUCCESS] Converted finfo.bin to " + jsonPath);
    }

    static void JsonToFinfo(string binPath, string jsonPath)
    {
        string jsonStr = File.ReadAllText(jsonPath, Encoding.UTF8);
        var jsonDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(jsonStr);
        if (jsonDict == null) return;

        List<string> flagsList = new List<string>();
        if (jsonDict.TryGetValue("flag_map", out JsonElement flagMapElem))
        {
            foreach (var elem in flagMapElem.EnumerateArray())
            {
                flagsList.Add(elem.GetString() ?? "");
            }
        }

        byte[] array = new byte[flagsList.Count * 128 + 4096];
        int num = 4;
        PutUint32((uint)flagsList.Count, array, num);
        num += 4;

        foreach (var key in flagsList)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(key);
            PutUint32((uint)bytes.Length, array, num);
            num += 4;
            bytes.CopyTo(array, num);
            num += bytes.Length;
        }

        PutUint32((uint)(num ^ -746806706), array, 0);

        uint num2 = 2369738012u;
        for (int i = 4; i < num; i++)
        {
            array[i] ^= (byte)(num2 & 0xFF);
            num2 = ((num2 << 3) + 16701) ^ (num2 >> 16);
        }

        using (FileStream fs = File.Create(binPath))
        {
            fs.Write(array, 0, num);
        }
        Console.WriteLine("[SUCCESS] Converted " + jsonPath + " to finfo.bin");
    }

    static string SerializeObject(object obj)
    {
        var options = new JsonSerializerOptions
        {
            WriteIndented = true
        };
        
        object genericRep = ConvertToGeneric(obj, new Dictionary<object, object>());
        return JsonSerializer.Serialize(genericRep, options);
    }

    static object? ConvertToGeneric(object? obj, Dictionary<object, object> visited)
    {
        if (obj == null) return null;
        
        Type type = obj.GetType();
        if (type.IsPrimitive || type == typeof(string) || type == typeof(decimal))
        {
            return obj;
        }

        if (visited.ContainsKey(obj))
        {
            return "$ref_circular";
        }
        visited[obj] = true;

        if (obj is IDictionary dict)
        {
            var dictRep = new Dictionary<string, object?>();
            foreach (DictionaryEntry entry in dict)
            {
                string keyStr = entry.Key?.ToString() ?? "null";
                dictRep[keyStr] = ConvertToGeneric(entry.Value, visited);
            }
            return dictRep;
        }

        if (obj is IEnumerable enumObj)
        {
            var listRep = new List<object?>();
            foreach (object? item in enumObj)
            {
                listRep.Add(ConvertToGeneric(item, visited));
            }
            return listRep;
        }

        var objRep = new Dictionary<string, object?>();
        objRep["$type"] = type.FullName;

        FieldInfo[] fields = type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
        foreach (FieldInfo field in fields)
        {
            objRep[field.Name] = ConvertToGeneric(field.GetValue(obj), visited);
        }

        return objRep;
    }

    static void UpdateObject(object? target, object? sourceValue)
    {
        if (target == null || sourceValue == null) return;

        Type targetType = target.GetType();

        if (target is IDictionary targetDict && sourceValue is IDictionary sourceDict)
        {
            foreach (object key in sourceDict.Keys)
            {
                string stringKey = key.ToString() ?? "";
                object? val = sourceDict[key];
                
                object? targetKey = null;
                foreach (object tk in targetDict.Keys)
                {
                    if (tk.ToString() == stringKey)
                    {
                        targetKey = tk;
                        break;
                    }
                }

                if (targetKey != null)
                {
                    object? targetVal = targetDict[targetKey];
                    if (targetVal != null && IsComplexType(targetVal.GetType()))
                    {
                        UpdateObject(targetVal, val);
                    }
                    else
                    {
                        targetDict[targetKey] = ConvertToType(val, targetKey.GetType());
                    }
                }
            }
            return;
        }

        if (target is IList targetList && sourceValue is IList sourceList)
        {
            for (int i = 0; i < Math.Min(targetList.Count, sourceList.Count); i++)
            {
                object? targetVal = targetList[i];
                object? val = sourceList[i];
                if (targetVal != null && IsComplexType(targetVal.GetType()))
                {
                    UpdateObject(targetVal, val);
                }
                else
                {
                    Type elemType = targetVal != null ? targetVal.GetType() : typeof(object);
                    targetList[i] = ConvertToType(val, elemType);
                }
            }
            return;
        }

        if (sourceValue is JsonElement jsonElem)
        {
            if (jsonElem.ValueKind == JsonValueKind.Object)
            {
                FieldInfo[] fields = targetType.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
                foreach (FieldInfo field in fields)
                {
                    if (jsonElem.TryGetProperty(field.Name, out JsonElement propVal))
                    {
                        object? currentTargetVal = field.GetValue(target);

                        if (currentTargetVal != null && IsComplexType(field.FieldType))
                        {
                            UpdateObject(currentTargetVal, propVal);
                        }
                        else
                        {
                            field.SetValue(target, ConvertToType(propVal, field.FieldType));
                        }
                    }
                }
            }
        }
    }

    static bool IsComplexType(Type type)
    {
        return !type.IsPrimitive && type != typeof(string) && type != typeof(decimal) && !type.IsEnum;
    }

    static object? ConvertToType(object? val, Type targetType)
    {
        if (val == null) return null;

        if (val is JsonElement jsonElem)
        {
            switch (jsonElem.ValueKind)
            {
                case JsonValueKind.Null:
                    return null;
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                case JsonValueKind.Number:
                    if (targetType == typeof(float)) return jsonElem.GetSingle();
                    if (targetType == typeof(double)) return jsonElem.GetDouble();
                    if (targetType == typeof(decimal)) return jsonElem.GetDecimal();
                    if (targetType == typeof(long)) return jsonElem.GetInt64();
                    return jsonElem.GetInt32();
                case JsonValueKind.String:
                    string str = jsonElem.GetString() ?? "";
                    if (targetType.IsEnum) return Enum.Parse(targetType, str);
                    return str;
            }
        }

        if (targetType.IsAssignableFrom(val.GetType())) return val;

        if (targetType.IsEnum)
        {
            return Enum.Parse(targetType, val.ToString() ?? "");
        }

        try
        {
            return Convert.ChangeType(val, targetType);
        }
        catch
        {
            if (targetType == typeof(float))
            {
                return Convert.ToSingle(val);
            }
            if (targetType == typeof(double))
            {
                return Convert.ToDouble(val);
            }
            if (targetType == typeof(int))
            {
                return Convert.ToInt32(val);
            }
            return val;
        }
    }
}
