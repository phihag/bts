#!/usr/bin/env bash
set -euo pipefail

# Check if node is installed
if ! command -v node >/dev/null 2>&1; then

# If not, install it
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  \. "$HOME/.nvm/nvm.sh"
  nvm install 24
fi

# Install BTS to home
cd ~
if [ ! -d "bts" ]; then
    git clone https://github.com/tlehr/bts.git
fi

cd bts
git fetch
git switch feat/automaticCall
make deps

# Install BUP to home
cd ~

if [ ! -d "bup" ]; then
    git clone https://github.com/tlehr/bup.git
fi

cd bup
git fetch
git switch feat/addTimerAfterCall
make deps

# Use Development BUP in BTS
cd ~/bts || exit 1

cat > config.json <<'EOF'
{
  "port": 4000,
  "bup_location": "static/bup/dev",
  "bup_index": "bup.html",
  "report_errors": true,
  "enable_https": false
}
EOF

# Create symlink
ln -s ~/bup/ ~/bts/static/bup/dev

# use node version that works
nvm install 22.18.0
node_path="$(which node)"

# copy used node version into service template
cat > "$HOME/bts/div/bts.service.template" <<EOF
[Unit]
Description=bts

[Service]
ExecStart=${node_path} BTS_ROOT_DIR/bts/bts.js
Type=simple
User=bts
Group=bts
WorkingDirectory=BTS_ROOT_DIR
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# install as service
cd ~/bts
sudo make install-service

exit 0