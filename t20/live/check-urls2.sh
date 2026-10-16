#!/bin/bash
read code size < <(curl -s -o /dev/null --max-time 25 -w "%{http_code} %{size_download}" "$1")
echo "$code $size $1"
