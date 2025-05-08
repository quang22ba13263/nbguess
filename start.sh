#!/bin/bash

# Hiển thị phiên bản Python đang sử dụng
echo "Python version:"
python3 --version

# Cài đặt dependencies
pip3 install --user -r requirements.txt

# Khởi động server
python3 server.py 