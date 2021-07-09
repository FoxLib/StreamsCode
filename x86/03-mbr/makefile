all:
	rm -f *.lock
	fasm boot.asm
	dd if=boot.bin of=disk.img conv=notrunc bs=446 count=1 > /dev/null 2>&1
	bochs -f c.bxrc -q > /dev/null 2>&1
