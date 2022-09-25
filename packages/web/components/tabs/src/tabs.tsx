import {
  computed,
  defineComponent,
  getCurrentInstance,
  nextTick,
  provide,
  ref,
  renderSlot,
  shallowReactive,
  shallowRef,
  watch,
} from 'vue'
import {
  buildProps,
  definePropType,
  isNumber,
  isString,
  isUndefined,
} from '@element-plus/utils'
import { EVENT_CODE, UPDATE_MODEL_EVENT } from '@element-plus/constants'
import ElIcon from '@element-plus/components/icon'
import { Plus } from '@element-plus/icons-vue'
import { tabsRootContextKey } from '@element-plus/tokens'
import { useDeprecated, useNamespace } from '@element-plus/hooks'
import TabNav from './tab-nav'
import { getOrderedPanes } from './utils/pane'

import type { TabNavInstance } from './tab-nav'
import type { TabsPaneContext } from '@element-plus/tokens'
import type { ExtractPropTypes } from 'vue'
import type { Awaitable } from '@element-plus/utils'

export type TabPanelName = string | number

export const tabsProps = buildProps({
  type: {
    type: String,
    values: ['card', 'border-card', ''],
    default: '',
  },
  activeName: {
    type: [String, Number],
  },
  closable: Boolean,
  addable: Boolean,
  modelValue: {
    type: [String, Number],
  },
  editable: Boolean,
  tabPosition: {
    type: String,
    values: ['top', 'right', 'bottom', 'left'],
    default: 'top',
  },
  beforeLeave: {
    type: definePropType<
      (
        newName: TabPanelName,
        oldName: TabPanelName
      ) => Awaitable<void | boolean>
    >(Function),
    default: () => true,
  },
  stretch: Boolean,
} as const)
export type TabsProps = ExtractPropTypes<typeof tabsProps>

const isPanelName = (value: unknown): value is string | number =>
  isString(value) || isNumber(value)

export const tabsEmits = {
  [UPDATE_MODEL_EVENT]: (name: TabPanelName) => isPanelName(name),
  tabClick: (pane: TabsPaneContext, ev: Event) => ev instanceof Event,
  tabChange: (name: TabPanelName) => isPanelName(name),
  edit: (paneName: TabPanelName | undefined, action: 'remove' | 'add') =>
    ['remove', 'add'].includes(action),
  tabRemove: (name: TabPanelName) => isPanelName(name),
  tabAdd: () => true,
}
export type TabsEmits = typeof tabsEmits

export type TabsPanes = Record<number, TabsPaneContext>

export default defineComponent({
  name: 'ElTabs',

  props: tabsProps,
  emits: tabsEmits,

  setup(props, { emit, slots, expose }) {
    const vm = getCurrentInstance()!

    const ns = useNamespace('tabs')

    const nav$ = ref<TabNavInstance>()
    const panes = shallowReactive<TabsPanes>({})
    const orderedPanes = shallowRef<TabsPaneContext[]>([])
    const currentName = ref<TabPanelName>(
      props.modelValue ?? props.activeName ?? '0'
    )

    const changeCurrentName = (value: TabPanelName) => {
      currentName.value = value
      emit(UPDATE_MODEL_EVENT, value)
      emit('tabChange', value)
    }

    const setCurrentName = async (value?: TabPanelName) => {
      // should do nothing.
      if (currentName.value === value || isUndefined(value)) return

      try {
        const canLeave = await props.beforeLeave?.(value, currentName.value)
        if (canLeave !== false) {
          changeCurrentName(value)

          // call exposed function, Vue doesn't support expose in typescript yet.
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          nav$.value?.removeFocus?.()
        }
      } catch {}
    }

    const handleTabClick = (
      tab: TabsPaneContext,
      tabName: TabPanelName,
      event: Event
    ) => {
      if (tab.props.disabled) return
      setCurrentName(tabName)
      emit('tabClick', tab, event)
    }

    const handleTabRemove = (pane: TabsPaneContext, ev: Event) => {
      if (pane.props.disabled || isUndefined(pane.props.name)) return
      ev.stopPropagation()
      emit('edit', pane.props.name, 'remove')
      emit('tabRemove', pane.props.name)
    }

    const handleTabAdd = () => {
      emit('edit', undefined, 'add')
      emit('tabAdd')
    }

    useDeprecated(
      {
        from: '"activeName"',
        replacement: '"model-value" or "v-model"',
        scope: 'ElTabs',
        version: '2.3.0',
        ref: 'https://element-plus.org/en-US/component/tabs.html#attributes',
        type: 'Attribute',
      },
      computed(() => !!props.activeName)
    )

    watch(
      () => props.activeName,
      (modelValue) => setCurrentName(modelValue)
    )

    watch(
      () => props.modelValue,
      (modelValue) => setCurrentName(modelValue)
    )

    watch(currentName, async () => {
      await nextTick()
      // call exposed function, Vue doesn't support expose in typescript yet.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      nav$.value?.scrollToActiveTab()
    })

    {
      const registerPane = (pane: TabsPaneContext) => {
        panes[pane.uid] = pane
        orderedPanes.value = getOrderedPanes(vm, panes)
      }

      const unregisterPane = (uid: number) => {
        delete panes[uid]
        orderedPanes.value = getOrderedPanes(vm, panes)
      }

      provide(tabsRootContextKey, {
        props,
        currentName,
        registerPane,
        unregisterPane,
      })
    }

    expose({
      currentName,
    })

    return () => {
      const newButton =
        props.editable || props.addable ? (
          <span
            class={ns.e('new-tab')}
            tabindex="0"
            onClick={handleTabAdd}
            onKeydown={(ev: KeyboardEvent) => {
              if (ev.code === EVENT_CODE.enter) handleTabAdd()
            }}
          >
            <ElIcon class={ns.is('icon-plus')}>
              <Plus />
            </ElIcon>
          </span>
        ) : null

      const header = (
        <div class={[ns.e('header'), ns.is(props.tabPosition)]}>
          {newButton}
          <TabNav
            ref={nav$}
            currentName={currentName.value}
            editable={props.editable}
            type={props.type}
            panes={orderedPanes.value}
            stretch={props.stretch}
            onTabClick={handleTabClick}
            onTabRemove={handleTabRemove}
          />
        </div>
      )

      const panels = (
        <div class={ns.e('content')}>{renderSlot(slots, 'default')}</div>
      )

      return (
        <div
          class={[
            ns.b(),
            ns.m(props.tabPosition),
            {
              [ns.m('card')]: props.type === 'card',
              [ns.m('border-card')]: props.type === 'border-card',
            },
          ]}
        >
          {...props.tabPosition !== 'bottom'
            ? [header, panels]
            : [panels, header]}
        </div>
      )
    }
  },
})
