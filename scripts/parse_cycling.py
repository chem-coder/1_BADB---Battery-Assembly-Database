#!/usr/bin/env python3
"""
parse_cycling.py — Parse battery cycling data files into structured JSON.

Usage:
    python3 scripts/parse_cycling.py --file /path/to/file.csv --format generic --session-id 42

Output: JSON to stdout with { datapoints, summary, meta }

Supported formats:
    generic  — CSV with columns: cycle, step, step_type, time_s, voltage_v, current_a, capacity_ah, energy_wh, temperature_c
    neware   — Neware BTS export CSV
    arbin    — Arbin MITS Pro export CSV
    biologic — EC-Lab .mpt/.txt export
"""

import argparse
import csv
import json
import sys
import os
from datetime import datetime


def parse_generic_csv(filepath):
    """Parse generic CSV with standardized column names."""
    datapoints = []

    # Try to detect delimiter
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        sample = f.read(4096)

    if '\t' in sample:
        delimiter = '\t'
    elif ';' in sample:
        delimiter = ';'
    else:
        delimiter = ','

    # Column name mappings (lowercase, stripped)
    COL_MAP = {
        'cycle': 'cycle_number', 'cycle_number': 'cycle_number', 'cycle number': 'cycle_number',
        'cycle_index': 'cycle_number', 'cycle index': 'cycle_number',
        'step': 'step_number', 'step_number': 'step_number', 'step number': 'step_number',
        'step_index': 'step_number', 'step index': 'step_number',
        'step_type': 'step_type', 'step type': 'step_type', 'type': 'step_type',
        'status': 'step_type', 'state': 'step_type',
        'time': 'time_s', 'time_s': 'time_s', 'time(s)': 'time_s',
        'test_time': 'time_s', 'test_time(s)': 'time_s', 'test time(s)': 'time_s',
        'total time': 'time_s', 'total_time': 'time_s',
        'voltage': 'voltage_v', 'voltage_v': 'voltage_v', 'voltage(v)': 'voltage_v',
        'vol(v)': 'voltage_v', 'ecell/v': 'voltage_v',
        'current': 'current_a', 'current_a': 'current_a', 'current(a)': 'current_a',
        'cur(a)': 'current_a', 'i/ma': 'current_ma',
        'capacity': 'capacity_ah', 'capacity_ah': 'capacity_ah', 'capacity(ah)': 'capacity_ah',
        'cap(ah)': 'capacity_ah', 'q charge/discharge/mA.h': 'capacity_mah',
        'energy': 'energy_wh', 'energy_wh': 'energy_wh', 'energy(wh)': 'energy_wh',
        'temperature': 'temperature_c', 'temperature_c': 'temperature_c', 'temp': 'temperature_c',
        'aux_temperature_1': 'temperature_c',
    }

    STEP_TYPE_MAP = {
        'cc_chg': 'charge', 'cc chg': 'charge', 'charge': 'charge', 'c': 'charge',
        'cccv_chg': 'cccv', 'cccv chg': 'cccv', 'cccv': 'cccv',
        'cc_dchg': 'discharge', 'cc dchg': 'discharge', 'discharge': 'discharge', 'd': 'discharge',
        'rest': 'rest', 'r': 'rest', 'pause': 'rest',
    }

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=delimiter)

        # Map header columns
        col_mapping = {}
        for raw_col in reader.fieldnames or []:
            normalized = raw_col.strip().lower()
            if normalized in COL_MAP:
                col_mapping[raw_col] = COL_MAP[normalized]

        if 'voltage_v' not in col_mapping.values():
            raise ValueError(f"Cannot find voltage column. Headers: {reader.fieldnames}")

        for row in reader:
            dp = {}
            for raw_col, mapped in col_mapping.items():
                val = row.get(raw_col, '').strip()
                if not val:
                    continue
                if mapped == 'step_type':
                    dp[mapped] = STEP_TYPE_MAP.get(val.lower(), val.lower())
                elif mapped == 'current_ma':
                    dp['current_a'] = safe_float(val) / 1000.0 if safe_float(val) is not None else None
                elif mapped == 'capacity_mah':
                    dp['capacity_ah'] = safe_float(val) / 1000.0 if safe_float(val) is not None else None
                elif mapped in ('cycle_number', 'step_number'):
                    dp[mapped] = safe_int(val)
                else:
                    dp[mapped] = safe_float(val)

            if dp.get('voltage_v') is not None:
                datapoints.append(dp)

    return datapoints


def safe_float(val):
    try:
        return float(val.replace(',', '.'))
    except (ValueError, AttributeError):
        return None


def safe_int(val):
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def compute_summary(datapoints):
    """Compute per-cycle summary metrics from raw datapoints."""
    cycles = {}
    for dp in datapoints:
        cn = dp.get('cycle_number', 0)
        if cn not in cycles:
            cycles[cn] = {'charge': [], 'discharge': [], 'all': []}
        step = dp.get('step_type', '')
        if step in ('charge', 'cccv'):
            cycles[cn]['charge'].append(dp)
        elif step == 'discharge':
            cycles[cn]['discharge'].append(dp)
        cycles[cn]['all'].append(dp)

    summary = []
    for cn in sorted(cycles.keys()):
        c = cycles[cn]
        charge_cap = max_capacity(c['charge'])
        discharge_cap = max_capacity(c['discharge'])
        charge_energy = max_energy(c['charge'])
        discharge_energy = max_energy(c['discharge'])

        voltages = [dp.get('voltage_v') for dp in c['all'] if dp.get('voltage_v') is not None]
        temps = [dp.get('temperature_c') for dp in c['all'] if dp.get('temperature_c') is not None]
        times = [dp.get('time_s') for dp in c['all'] if dp.get('time_s') is not None]

        ce = (discharge_cap / charge_cap * 100) if charge_cap and charge_cap > 0 and discharge_cap is not None else None

        summary.append({
            'cycle_number': cn,
            'charge_capacity_ah': charge_cap,
            'discharge_capacity_ah': discharge_cap,
            'coulombic_efficiency': round(ce, 2) if ce else None,
            'charge_energy_wh': charge_energy,
            'discharge_energy_wh': discharge_energy,
            'max_voltage_v': max(voltages) if voltages else None,
            'min_voltage_v': min(voltages) if voltages else None,
            'avg_temperature_c': round(sum(temps) / len(temps), 1) if temps else None,
            'duration_s': (max(times) - min(times)) if len(times) >= 2 else None,
        })

    return summary


def max_capacity(points):
    caps = [dp.get('capacity_ah') for dp in points if dp.get('capacity_ah') is not None]
    return max(caps) if caps else None


def max_energy(points):
    energies = [dp.get('energy_wh') for dp in points if dp.get('energy_wh') is not None]
    return max(energies) if energies else None


def extract_meta(datapoints, summary):
    """Extract session metadata from parsed data."""
    times = [dp.get('time_s') for dp in datapoints if dp.get('time_s') is not None]
    cycles = [dp.get('cycle_number') or 0 for dp in datapoints]

    return {
        'total_cycles': (max(cycles) + 1) if cycles else 0,
        'total_datapoints': len(datapoints),
        'started_at': None,  # Would need absolute timestamps from equipment
        'ended_at': None,
        'max_time_s': max(times) if times else 0,
    }


def main():
    parser = argparse.ArgumentParser(description='Parse battery cycling data files')
    parser.add_argument('--file', required=True, help='Path to data file')
    parser.add_argument('--format', default='generic', choices=['generic', 'neware', 'arbin', 'biologic'],
                        help='Equipment/file format')
    parser.add_argument('--session-id', type=int, default=0, help='Session ID (for logging)')
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(json.dumps({'error': f'File not found: {args.file}'}), file=sys.stdout)
        sys.exit(1)

    try:
        # All formats currently use generic parser (specific ones to be added in Phase 3)
        datapoints = parse_generic_csv(args.file)

        if not datapoints:
            print(json.dumps({'error': 'No datapoints parsed from file'}), file=sys.stdout)
            sys.exit(1)

        summary = compute_summary(datapoints)
        meta = extract_meta(datapoints, summary)

        result = {
            'datapoints': datapoints,
            'summary': summary,
            'meta': meta,
        }

        print(json.dumps(result), file=sys.stdout)

    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stdout)
        sys.exit(1)


if __name__ == '__main__':
    main()
