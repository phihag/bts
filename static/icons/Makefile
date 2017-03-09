all: favicon.png favicon.ico

favicon.png : favicon.svg
	inkscape --export-png=favicon.png -w 64 -h 64 favicon.svg

favicon.ico: favicon.png
	convert favicon.png favicon.ico

clean:
	rm -f favicon.png favicon.ico

.PHONY: all clean
