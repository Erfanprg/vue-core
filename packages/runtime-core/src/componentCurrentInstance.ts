import { getGlobalThis } from '@vue/shared'
import type {
  ComponentInternalInstance,
  GenericComponentInstance,
} from './component'
import { currentRenderingInstance } from './componentRenderContext'

/**
 * @internal
 */
export let currentInstance: GenericComponentInstance | null = null

/**
 * @internal
 */
export const getCurrentGenericInstance: () => GenericComponentInstance | null =
  () => currentInstance || currentRenderingInstance

export const getCurrentInstance: () => ComponentInternalInstance | null = () =>
  currentInstance && !currentInstance.vapor
    ? (currentInstance as ComponentInternalInstance)
    : currentRenderingInstance

export let isInSSRComponentSetup = false

export let setInSSRSetupState: (state: boolean) => void

let internalSetCurrentInstance: (
  instance: GenericComponentInstance | null,
) => void

/**
 * The following makes getCurrentInstance() usage across multiple copies of Vue
 * work. Some cases of how this can happen are summarized in #7590. In principle
 * the duplication should be avoided, but in practice there are often cases
 * where the user is unable to resolve on their own, especially in complicated
 * SSR setups.
 *
 * Note this fix is technically incomplete, as we still rely on other singletons
 * for effectScope and global reactive dependency maps. However, it does make
 * some of the most common cases work. It also warns if the duplication is
 * found during browser execution.
 */
if (__SSR__) {
  type Setter = (v: any) => void
  const g = getGlobalThis()
  const registerGlobalSetter = (key: string, setter: Setter) => {
    let setters: Setter[]
    if (!(setters = g[key])) setters = g[key] = []
    setters.push(setter)
    return (v: any) => {
      if (setters.length > 1) setters.forEach(set => set(v))
      else setters[0](v)
    }
  }
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    v => (currentInstance = v),
  )
  // also make `isInSSRComponentSetup` sharable across copies of Vue.
  // this is needed in the SFC playground when SSRing async components, since
  // we have to load both the runtime and the server-renderer from CDNs, they
  // contain duplicated copies of Vue runtime code.
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    v => (isInSSRComponentSetup = v),
  )
} else {
  internalSetCurrentInstance = i => {
    currentInstance = i
  }
  setInSSRSetupState = v => {
    isInSSRComponentSetup = v
  }
}

/**
 * @internal
 */
export const setCurrentInstance = (instance: GenericComponentInstance) => {
  const prev = currentInstance
  internalSetCurrentInstance(instance)
  instance.scope.on()
  return (): void => {
    instance.scope.off()
    internalSetCurrentInstance(prev)
  }
}

export const unsetCurrentInstance = (): void => {
  currentInstance && currentInstance.scope.off()
  internalSetCurrentInstance(null)
}
