/** Les migrations sont importées comme du texte (loader `text` d'esbuild). */
declare module '*.sql' {
  const contenu: string
  export default contenu
}
