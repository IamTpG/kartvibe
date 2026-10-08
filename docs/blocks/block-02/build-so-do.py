#!/usr/bin/env python3
"""Tạo so-do-kien-truc.html từ so-do-kien-truc.md. Chạy: python3 build-so-do.py (trong thư mục docs/blocks/block-02)."""
import subprocess, sys
from pathlib import Path
here = Path(__file__).resolve().parent
sys.exit(subprocess.call([sys.executable, str(here / 'build-html.py'), str(here / 'so-do-kien-truc.md'), str(here / 'so-do-kien-truc.html'),
    'Sơ đồ kiến trúc và quyết định: Block 2',
    'Cần internet để tải thư viện Mermaid. Dùng Ctrl + cuộn chuột để phóng to khi trình bày.']))
