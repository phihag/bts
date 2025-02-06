#!/bin/bash
cd "$(dirname "$(realpath "$0")")"
git pull
cd ./static/bup/dev
git pull
sudo systemctl restart bts
