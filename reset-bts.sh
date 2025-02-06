#!/bin/bash
cd "$(dirname "$(realpath "$0")")"

sudo systemctl stop bts
rm -rf ./data/*
cp -rf ./blank_tournament/* ./data/
sudo systemctl start bts
