#ifndef MOLFAR_LINK_H
#define MOLFAR_LINK_H
#ifdef __cplusplus
extern "C" {
#endif
// Returns owned UTF-8 JSON. Every non-null result must be released once.
char *molfar_link_call(const char *input);
void molfar_link_free(char *output);
#ifdef __cplusplus
}
#endif
#endif
