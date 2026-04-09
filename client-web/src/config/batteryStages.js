// ═══════════════════════════════════════════════════════════════════
// Battery Stage Definitions — for battery assembly constructor
// ═══════════════════════════════════════════════════════════════════

export const BATTERY_STAGES = [
  {
    code: 'general',
    label: 'Общее',
    icon: 'pi pi-info-circle',
    hasApiStep: false,
    fields: [
      { key: 'form_factor', label: 'Форм-фактор', type: 'select', options: [
        { value: 'coin', label: 'Монеточный' },
        { value: 'pouch', label: 'Пакетный' },
        { value: 'cylindrical', label: 'Цилиндрический' },
      ]},
      { key: 'battery_notes', label: 'Заметки', type: 'textarea' },
    ],
  },
  {
    code: 'config',
    label: 'Конфигурация',
    icon: 'pi pi-cog',
    hasApiStep: true,
    fields: [
      { key: 'coin_cell_mode', label: 'Режим (coin)', type: 'select', options: [
        { value: 'full_cell', label: 'Full cell' },
        { value: 'half_cell', label: 'Half cell' },
      ]},
      { key: 'coin_size_code', label: 'Размер (coin)', type: 'text' },
      { key: 'half_cell_type', label: 'Тип полуячейки', type: 'text' },
      { key: 'coin_layout', label: 'Схема (coin)', type: 'select', options: [
        { value: 'SE', label: 'SE' },
        { value: 'ES', label: 'ES' },
        { value: 'ESE', label: 'ESE' },
      ]},
      { key: 'spacer_thickness_mm', label: 'Толщина спейсера, мм', type: 'number' },
      { key: 'spacer_count', label: 'Кол-во спейсеров', type: 'number' },
      { key: 'spacer_notes', label: 'Заметки (спейсер)', type: 'textarea' },
      { key: 'li_foil_notes', label: 'Заметки (Li фольга)', type: 'textarea' },
    ],
  },
  {
    code: 'electrodes',
    label: 'Электроды',
    icon: 'pi pi-clone',
    hasApiStep: true,
    fields: [
      { key: 'cathode_tape_id', label: 'Катодная лента (ID)', type: 'number' },
      { key: 'cathode_cut_batch_id', label: 'Катодная партия (ID)', type: 'number' },
      { key: 'cathode_source_notes', label: 'Заметки (катод)', type: 'textarea' },
      { key: 'anode_tape_id', label: 'Анодная лента (ID)', type: 'number' },
      { key: 'anode_cut_batch_id', label: 'Анодная партия (ID)', type: 'number' },
      { key: 'anode_source_notes', label: 'Заметки (анод)', type: 'textarea' },
    ],
  },
  {
    code: 'separator',
    label: 'Сепаратор',
    icon: 'pi pi-minus',
    hasApiStep: true,
    fields: [
      { key: 'separator_id', label: 'Сепаратор (ID)', type: 'number' },
      { key: 'separator_notes', label: 'Заметки', type: 'textarea' },
    ],
  },
  {
    code: 'electrolyte',
    label: 'Электролит',
    icon: 'pi pi-database',
    hasApiStep: true,
    fields: [
      { key: 'electrolyte_id', label: 'Электролит (ID)', type: 'number' },
      { key: 'electrolyte_total_ul', label: 'Объём, мкл', type: 'number' },
      { key: 'electrolyte_notes', label: 'Заметки', type: 'textarea' },
    ],
  },
]

export const BATTERY_STAGE_CODES = BATTERY_STAGES.map(s => s.code)
