// tsc ne lit pas les SFC (vue-tsc ne supporte pas encore TypeScript 7)
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}
