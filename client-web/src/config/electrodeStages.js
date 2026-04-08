// ═══════════════════════════════════════════════════════════════════
// Electrode Stage Definitions — for electrode cut batch constructor
// ═══════════════════════════════════════════════════════════════════

export const ELECTRODE_STAGES = [
  {
    code: 'cutting',
    label: 'Нарезка',
    icon: 'pi pi-stop-circle',
    hasApiStep: false, // saved via /api/electrodes/electrode-cut-batches/:id
    fields: [
      { key: 'shape', label: 'Форма', type: 'select', options: [
        { value: 'circle', label: 'Круг' },
        { value: 'rectangle', label: 'Прямоугольник' },
      ]},
      { key: 'diameter_mm', label: 'Диаметр, мм', type: 'number' },
      { key: 'length_mm', label: 'Длина, мм', type: 'number' },
      { key: 'width_mm', label: 'Ширина, мм', type: 'number' },
      { key: 'comments', label: 'Комментарии', type: 'textarea' },
    ],
  },
  {
    code: 'drying',
    label: 'Сушка',
    icon: 'pi pi-sun',
    hasApiStep: true, // saved via /api/electrodes/electrode-cut-batches/:id/drying
    fields: [
      { key: 'temperature_c', label: 'Температура, °C', type: 'number' },
      { key: 'start_time', label: 'Начало', type: 'text' },
      { key: 'end_time', label: 'Конец', type: 'text' },
      { key: 'other_parameters', label: 'Параметры', type: 'textarea' },
      { key: 'comments', label: 'Комментарии', type: 'textarea' },
    ],
  },
]

export const ELECTRODE_STAGE_CODES = ELECTRODE_STAGES.map(s => s.code)
