bts - Badminton Tournament Software
==========

Use [bup](https://github.com/phihag/bup/) at tournaments.

## Docker installation

[Install docker](https://docs.docker.com/install/) and run

```
docker run -p 4000:4000 phihag/bts
```

This will run bts on http://localhost:4000/ .

To run it in the background, and store the data permanently, run something like
```bash
docker run -d --name bts -v "$PWD/btsdata:/bts/data" --restart=always -p 4000:4000 phihag/bts
``` 

## Manual installation

To install, type

    make

To start, type

	make run  # Production mode
	make dev  # Development mode

# Usage

To start a display, go to http://IP:4000/d2 , where 2 is the court number (alternatively, just `/d`).
To start an umpire panel, go to http://IP:4000/u2 , where 2 is the court number (alternatively, just `/u`).

# Helper scripts

- `./fetch-btp.js` - Fetch data from BTP via TPNetwork protocol
- `div/decode.js` - Decode VisualReality hex format
