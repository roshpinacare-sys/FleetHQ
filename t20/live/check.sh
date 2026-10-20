#!/bin/bash
u="$1"
read code size < <(curl -s -o /dev/null --max-time 25 -w "%{http_code} %{size_download}" "$u")
echo "$code $size $u"
