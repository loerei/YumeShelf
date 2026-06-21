#include <windows.h>
#include <stdio.h>
#include <format>
#include <string>

WNDPROC OriginalWndProc = nullptr;

void LogToFile(const char* msg) {
    // Write log to the same directory or current working directory
    FILE* f = fopen("background_payload.log", "a");
    if (f) {
        fprintf(f, "%s\n", msg);
        fclose(f);
    }
}

LRESULT CALLBACK HookedWndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    if (uMsg == WM_KILLFOCUS) {
        return 0; // Ignore
    }
    if (uMsg == WM_ACTIVATE) {
        if (LOWORD(wParam) == WA_INACTIVE) {
            return 0; // Ignore
        }
    }
    if (uMsg == WM_ACTIVATEAPP) {
        if (wParam == FALSE) {
            return 0; // Ignore
        }
    }
    if (OriginalWndProc) {
        return CallWindowProc(OriginalWndProc, hwnd, uMsg, wParam, lParam);
    }
    return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    DWORD processId;
    GetWindowThreadProcessId(hwnd, &processId);
    if (processId == GetCurrentProcessId()) {
        char className[256];
        GetClassNameA(hwnd, className, sizeof(className));
        
        std::string logStr = std::format("Found window for our PID. Class: {}, Visible: {}", className, IsWindowVisible(hwnd));
        LogToFile(logStr.c_str());

        if (IsWindowVisible(hwnd) && lstrcmpA(className, "ConsoleWindowClass") != 0) {
            OriginalWndProc = (WNDPROC)SetWindowLongPtr(hwnd, GWLP_WNDPROC, (LONG_PTR)HookedWndProc);
            if (OriginalWndProc) {
                LogToFile("Successfully subclassed the window!");
            } else {
                std::string errStr = std::format("SetWindowLongPtr failed with error: {}", GetLastError());
                LogToFile(errStr.c_str());
            }
            return FALSE; // Stop enumeration
        }
    }
    return TRUE;
}

DWORD WINAPI InjectionThread(LPVOID lpParam) {
    LogToFile("Injection thread started. Waiting 2000ms...");
    Sleep(2000);
    LogToFile("Running EnumWindows pass 1...");
    EnumWindows(EnumWindowsProc, 0);
    
    if (!OriginalWndProc) {
        LogToFile("Window not found or subclass failed. Waiting 5000ms...");
        Sleep(5000);
        LogToFile("Running EnumWindows pass 2...");
        EnumWindows(EnumWindowsProc, 0);
    }
    
    if (!OriginalWndProc) {
        LogToFile("Window not found or subclass failed. Waiting another 10000ms...");
        Sleep(10000);
        LogToFile("Running EnumWindows pass 3...");
        EnumWindows(EnumWindowsProc, 0);
    }
    return 0;
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    if (ul_reason_for_call == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hModule);
        LogToFile("DLL_PROCESS_ATTACH received.");
        CreateThread(NULL, 0, InjectionThread, NULL, 0, NULL);
    }
    return TRUE;
}
