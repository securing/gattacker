CC=gcc
LINK_OPT=-lbluetooth
RM=rm

default: bdaddr

bdaddr: bdaddr.o oui.o
	$(CC) -o bdaddr bdaddr.o oui.o $(LINK_OPT)

bdaddr.o: bdaddr.c
	$(CC) -c bdaddr.c

oui.o: oui.c
	$(CC) -c oui.c

clean:
	$(RM) -f *.o
	$(RM) -f bdaddr
