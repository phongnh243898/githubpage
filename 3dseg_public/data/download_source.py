#!/usr/bin/env python3
import sys
import json
import argparse
import subprocess
from pathlib import Path
from urllib.parse import urljoin

BASE_PATH = "https://img-edge.ai-studio.co.kr/"
DEFAULT_ARIA2C = Path("./bin/aria2c.exe")


def parse_args():
    parser = argparse.ArgumentParser(
        prog="download_source",
        description="Download PCD & camera images using aria2c"
    )

    parser.add_argument(
        "input_path",
        help="Path to input JSON file"
    )

    parser.add_argument(
        "-o", "--output",
        dest="output_path",
        default="./raw",
        help="Output folder (default: ./raw)"
    )

    parser.add_argument(
        "--aria2c",
        dest="aria2c_path",
        default=str(DEFAULT_ARIA2C),
        help="Path to aria2c executable (default: ./bin/aria2c.exe)"
    )

    return parser.parse_args()


def build_aria2_list(json_path: Path, save_folder: Path) -> Path:
    temp_list = save_folder / "aria2_download_list.txt"

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lines = []

    for task in data.get("data", []):
        # ===== PCD FILE =====
        pcd_url = urljoin(
            BASE_PATH,
            f"{task['path'].strip('/')}/{task['fileName']}"
        )
        lines.extend([
            pcd_url,
            f"  out={task['originalFileName']}",
            f"  dir={save_folder.as_posix()}",
            ""
        ])

        # ===== CAMERA IMAGES =====
        for cam in task.get("cameraImageList", []):
            cam_url = urljoin(
                BASE_PATH,
                f"{cam['rawFilePath'].strip('/')}/{cam['rawFileName']}"
            )
            lines.extend([
                cam_url,
                f"  out={cam['originalFileName']}",
                f"  dir={save_folder.as_posix()}",
                ""
            ])

    save_folder.mkdir(parents=True, exist_ok=True)
    temp_list.write_text("\n".join(lines), encoding="utf-8")
    return temp_list


def run_aria2c(aria2c_path: Path, input_file: Path):
    if not aria2c_path.exists():
        raise FileNotFoundError(
            f"aria2c not found: {aria2c_path} "
            f"(use --aria2c to specify path)"
        )

    cmd = [
        str(aria2c_path),
        "--input-file", str(input_file),
        "--continue=true",
        "--auto-file-renaming=false",
        "--summary-interval=5",
        "-x", "8",
        "-s", "8",
        "-j", "8"
    ]

    print(f"[INFO] Using aria2c: {aria2c_path}")
    print("[INFO] Starting download...")
    subprocess.run(cmd, check=True)


def main():
    args = parse_args()

    json_path = Path(args.input_path)
    save_folder = Path(args.output_path)
    aria2c_path = Path(args.aria2c_path)

    if not json_path.exists():
        print(f"[ERROR] Input JSON not found: {json_path}", file=sys.stderr)
        sys.exit(1)

    try:
        aria2_list = build_aria2_list(json_path, save_folder)
        print(f"[OK] Created aria2 list: {aria2_list}")

        run_aria2c(aria2c_path, aria2_list)

    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
