import { TEXT_MODEL_VALUES } from '../lib/apiProfiles'
import { useStore } from '../store'
import Select from './Select'

const TEXT_MODEL_TOOLTIPS: Record<string, string> = {
  'gpt-5.6-sol': '旗舰级文本模型。推理与理解能力最强，擅长复杂指令、多轮对话与高质量图像创作指导，适合追求最佳效果的场景。响应较慢、成本较高。',
  'gpt-5.6-terra': '均衡型文本模型。在能力、速度与成本之间取得良好平衡，日常对话与图像生成任务的主力选择，适合大多数场景。',
  'gpt-5.6-luna': '轻量快速型文本模型。响应速度最快、成本最低，适合简单对话与快速生成任务，复杂需求可切换到更高阶模型。',
}

export default function ModelSelectorPanel() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)

  const selectClass = 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm'

  return (
    <div className="fixed right-3 sm:right-6 z-40 bottom-[calc(var(--input-bar-clearance,12rem)+1rem)] w-44 rounded-2xl border border-gray-200/70 dark:border-white/[0.08] bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 dark:ring-white/10 p-3 flex flex-col gap-2.5">
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1 text-[11px]">图像模型</span>
        <Select
          value="gpt-image-2"
          onChange={() => {}}
          options={[{ label: 'gpt-image-2', value: 'gpt-image-2' }]}
          showValueTooltips={false}
          className={selectClass}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1 text-[11px]">文本模型</span>
        <Select
          value={settings.textModel}
          onChange={(model) => setSettings({ textModel: model })}
          options={TEXT_MODEL_VALUES.map((value) => ({ label: value, value, tooltip: TEXT_MODEL_TOOLTIPS[value] }))}
          showValueTooltips
          className={selectClass}
        />
      </label>
    </div>
  )
}
