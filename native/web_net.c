#include "web_net_sock.h"
#include <emscripten.h>
#include <stdatomic.h>
#include <stdbool.h>
#include "net_host.h"

enum { SOCKETS=8, QUEUE=64, PACKET=1500 };
typedef struct {int fd,n;uint8_t bytes[PACKET];} Packet;
typedef struct {_Atomic unsigned write,read;Packet packets[QUEUE];} Queue;
static _Atomic int sockets[SOCKETS];
static Queue outgoing,incoming[SOCKETS];
static unsigned generation;
static uint8_t inbox[PACKET];
static _Atomic unsigned dropped;
static Queue *rx(int fd){return &incoming[(unsigned)fd%SOCKETS];}
static bool valid(int fd){return fd>0&&atomic_load(&sockets[(unsigned)fd%SOCKETS])==fd;}
static bool push(Queue *q,int fd,const void *data,int n){
 unsigned w=atomic_load_explicit(&q->write,memory_order_relaxed),r=atomic_load_explicit(&q->read,memory_order_acquire);
 if(w-r>=QUEUE){atomic_fetch_add(&dropped,1);return false;}
 Packet *p=&q->packets[w%QUEUE];p->fd=fd;p->n=n;memcpy(p->bytes,data,n);
 atomic_store_explicit(&q->write,w+1,memory_order_release);return true;
}
static Packet *peek(Queue *q){
 unsigned r=atomic_load_explicit(&q->read,memory_order_relaxed);
 return r==atomic_load_explicit(&q->write,memory_order_acquire)?NULL:&q->packets[r%QUEUE];
}
static void pop(Queue *q){atomic_fetch_add_explicit(&q->read,1,memory_order_release);}
int web_socket(int domain,int type,int protocol){
 (void)protocol;if(domain!=AF_INET||type!=SOCK_DGRAM){errno=EPROTONOSUPPORT;return -1;}
 for(int i=0;i<SOCKETS;i++)if(!atomic_load(&sockets[i])){int fd=(int)(++generation*SOCKETS)+i;atomic_store(&sockets[i],fd);return fd;}
 errno=EMFILE;return -1;
}
int web_close(int fd){if(valid(fd))atomic_store(&sockets[(unsigned)fd%SOCKETS],0);return 0;}
ssize_t web_sendto(int fd,const void *data,size_t n,int flags,const struct sockaddr *addr,socklen_t len){
 (void)flags;(void)addr;(void)len;
 if(!valid(fd)){errno=EBADF;return -1;}if(n>PACKET){errno=EMSGSIZE;return -1;}
 if(!push(&outgoing,fd,data,(int)n)){errno=EAGAIN;return -1;}return (ssize_t)n;
}
ssize_t web_recvfrom(int fd,void *data,size_t n,int flags,struct sockaddr *addr,socklen_t *len){
 (void)flags;if(!valid(fd)){errno=EBADF;return -1;}Queue *q=rx(fd);Packet *p;
 while((p=peek(q))){if(p->fd!=fd){pop(q);continue;}
   size_t count=n<(size_t)p->n?n:(size_t)p->n;memcpy(data,p->bytes,count);pop(q);
   if(addr&&len){struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons(27750);a.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
     memcpy(addr,&a,*len<sizeof a?*len:sizeof a);*len=sizeof a;}return (ssize_t)count;
 }errno=EAGAIN;return -1;
}
EMSCRIPTEN_KEEPALIVE int *web_net_sockets(void){return (int*)sockets;}
EMSCRIPTEN_KEEPALIVE int *web_net_peek(void){return (int*)peek(&outgoing);}
EMSCRIPTEN_KEEPALIVE void web_net_sent(void){if(peek(&outgoing))pop(&outgoing);}
EMSCRIPTEN_KEEPALIVE uint8_t *web_net_inbox(void){return inbox;}
EMSCRIPTEN_KEEPALIVE int web_net_receive(int fd,int n){return valid(fd)&&n>=16&&n<=PACKET&&push(rx(fd),fd,inbox,n);}
EMSCRIPTEN_KEEPALIVE unsigned web_net_dropped(void){return atomic_load(&dropped);}
/* Browsers meet on the website's server, including players on the same LAN. */
bool eng_nethost_start(int port,const eng_net_game *game){(void)port;(void)game;return false;}
void eng_nethost_stop(void){}
bool eng_nethost_running(void){return false;}
void eng_nethost_set_name(const char *name){(void)name;}
void eng_nethost_poll(void){}
