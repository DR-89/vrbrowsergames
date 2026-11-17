/* NMN2 datagrams use bounded SPSC queues. JS owns WebSockets, the core owns sockets.
 * Every socket is relayed to the operator's fixed NMN server, never a client address. */
#pragma once
#define ENG_NET_SOCK_H
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <ifaddrs.h>
#include <net/if.h>
typedef int eng_sock_t;
#define ENG_SOCK_BAD (-1)
int web_socket(int domain,int type,int protocol);
int web_close(int fd);
ssize_t web_sendto(int fd,const void *data,size_t n,int flags,const struct sockaddr *addr,socklen_t len);
ssize_t web_recvfrom(int fd,void *data,size_t n,int flags,struct sockaddr *addr,socklen_t *len);
#define socket web_socket
#define closesocket web_close
#define sendto web_sendto
#define recvfrom web_recvfrom
static inline int eng_sock_would_block(void){return errno==EAGAIN;}
static inline void eng_sock_init(void){}
static inline void eng_sock_nonblock(int fd){(void)fd;}
static inline int eng_addr_eq(const struct sockaddr_storage *a,const struct sockaddr_storage *b){
 const struct sockaddr_in *x=(const struct sockaddr_in*)a,*y=(const struct sockaddr_in*)b;
 return x->sin_family==y->sin_family&&x->sin_port==y->sin_port&&x->sin_addr.s_addr==y->sin_addr.s_addr;
}
