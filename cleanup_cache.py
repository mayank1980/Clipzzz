import os
import shutil
import glob
from pathlib import Path

def get_dir_size(path):
    total = 0
    if not os.path.exists(path):
        return 0
    for root, dirs, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total

def format_size(bytes_val):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.2f} TB"

def cleanup():
    root_dir = Path(__file__).resolve().parent
    print(f"==================================================")
    print(f"  CLIPZZZ JUNK & CACHE AUTO-CLEANUP")
    print(f"  Root: {root_dir}")
    print(f"==================================================")

    bytes_freed = 0
    items_removed = 0

    # 1. Clean Python __pycache__ and bytecode
    print("\n[1/4] Cleaning Python bytecode cache (__pycache__, *.pyc)...")
    for root, dirs, files in os.walk(root_dir):
        if 'venv' in root or '.venv' in root or 'node_modules' in root:
            continue
        for d in dirs:
            if d in ('__pycache__', '.pytest_cache', '.ruff_cache', '.mypy_cache'):
                full_path = os.path.join(root, d)
                size = get_dir_size(full_path)
                try:
                    shutil.rmtree(full_path, ignore_errors=True)
                    bytes_freed += size
                    items_removed += 1
                    print(f"  [+] Removed: {os.path.relpath(full_path, root_dir)} ({format_size(size)})")
                except Exception as e:
                    print(f"  [-] Error removing {d}: {e}")

        for f in files:
            if f.endswith(('.pyc', '.pyo', '.pyd')):
                full_path = os.path.join(root, f)
                try:
                    size = os.path.getsize(full_path)
                    os.remove(full_path)
                    bytes_freed += size
                    items_removed += 1
                except Exception:
                    pass

    # 2. Clean Vite pre-bundle cache & build temp
    print("\n[2/4] Cleaning Vite pre-bundle cache & temporary build files...")
    vite_cache = root_dir / "frontend" / "node_modules" / ".vite"
    if vite_cache.exists():
        size = get_dir_size(str(vite_cache))
        try:
            shutil.rmtree(str(vite_cache), ignore_errors=True)
            bytes_freed += size
            items_removed += 1
            print(f"  [+] Removed Vite cache: {format_size(size)}")
        except Exception as e:
            print(f"  [-] Error removing Vite cache: {e}")

    # 3. Clean temporary test artifacts & orphaned ASS subtitle files
    print("\n[3/4] Cleaning temporary test renders & subtitle files...")
    rendered_dir = root_dir / "backend" / "media" / "rendered_clips"
    if rendered_dir.exists():
        for f in rendered_dir.glob("test_*.*"):
            try:
                size = f.stat().st_size
                f.unlink()
                bytes_freed += size
                items_removed += 1
                print(f"  [+] Removed test render: {f.name} ({format_size(size)})")
            except Exception:
                pass
        for f in rendered_dir.glob("*.ass"):
            try:
                size = f.stat().st_size
                f.unlink()
                bytes_freed += size
                items_removed += 1
                print(f"  [+] Removed temp ASS subtitle: {f.name}")
            except Exception:
                pass

    audio_dir = root_dir / "backend" / "media" / "audio"
    if audio_dir.exists():
        for f in audio_dir.glob("test_*.*"):
            try:
                size = f.stat().st_size
                f.unlink()
                bytes_freed += size
                items_removed += 1
                print(f"  [+] Removed temp audio: {f.name} ({format_size(size)})")
            except Exception:
                pass

    # 4. Clean npm / system log crash dumps (*.log, npm-debug.log)
    print("\n[4/4] Cleaning temporary log files (*.log)...")
    for log_file in root_dir.glob("**/*.log"):
        if 'venv' in str(log_file) or 'node_modules' in str(log_file):
            continue
        try:
            size = log_file.stat().st_size
            log_file.unlink()
            bytes_freed += size
            items_removed += 1
            print(f"  [+] Removed log: {log_file.name} ({format_size(size)})")
        except Exception:
            pass

    print(f"\n==================================================")
    print(f"  CLEANUP COMPLETE!")
    print(f"  Total items removed: {items_removed}")
    print(f"  Total disk space freed: {format_size(bytes_freed)}")
    print(f"==================================================\n")

if __name__ == '__main__':
    cleanup()
