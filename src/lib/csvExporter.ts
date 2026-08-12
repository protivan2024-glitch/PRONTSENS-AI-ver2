import { RecordDoc, FormField } from '../types';

export function exportRecordsToCsv(records: RecordDoc[], fields: FormField[]): void {
  // Build fixed headers
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  const headers: string[] = [
    'ID do Prontuário',
    'Data de Registro',
    'Status HSE',
    'Nome do Motorista',
    'Avaliador (Colaborador)',
    'Enviado Por (E-mail)',
    'Duração (Minutos)',
    'Horário Início',
    'Horário Fim'
  ];

  // Add field labels and conditional labels
  sortedFields.forEach(f => {
    headers.push(f.label);
    if (f.id === 'f_empresa') {
      headers.push('Empresa (Especifique se Outros)');
    }
    if (f.id === 'f_empresa_sub') {
      headers.push('Empresa Sub-contratada (Especifique se Outros)');
    }
    if (f.id === 'f_medicamento') {
      headers.push('Nome do(s) Medicamento(s)');
    }
    if (f.id === 'f_status_liberacao') {
      headers.push('Categoria do Bloqueio');
      headers.push('Motivo do Bloqueio / Observação');
    }
  });

  const escapeCsv = (str: string | number | undefined | null): string => {
    if (str === undefined || str === null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows: string[] = [];

  // Header row
  rows.push(headers.map(h => escapeCsv(h)).join(';'));

  // Data rows
  records.forEach(r => {
    const rowData: string[] = [
      r.id,
      new Date(r.createdAt).toLocaleString('pt-BR'),
      r.status,
      String(r.answers['f_motorista'] || ''),
      r.collaboratorNameSnapshot || '',
      r.submittedBy || '',
      String(r.durationMinutes || ''),
      String(r.answers['f_time_start'] || ''),
      String(r.answers['f_time_end'] || '')
    ];

    sortedFields.forEach(f => {
      const rawVal = r.answers[f.id];
      const valStr = Array.isArray(rawVal) ? rawVal.join(', ') : (rawVal !== undefined ? String(rawVal) : '');
      rowData.push(valStr);

      if (f.id === 'f_empresa') {
        rowData.push(String(r.answers['f_empresa_outro'] || ''));
      }
      if (f.id === 'f_empresa_sub') {
        rowData.push(String(r.answers['f_empresa_sub_outro'] || ''));
      }
      if (f.id === 'f_medicamento') {
        rowData.push(String(r.answers['f_medicamento_nome'] || ''));
      }
      if (f.id === 'f_status_liberacao') {
        rowData.push(String(r.answers['f_categoria_bloqueio'] || ''));
        const motivo = r.answers['f_motivo_bloqueio'] || r.answers['f_motivo_observacao'] || '';
        rowData.push(String(motivo));
      }
    });

    rows.push(rowData.map(cell => escapeCsv(cell)).join(';'));
  });

  // UTF-8 BOM
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ProntoSens_Relatorio_HSE_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
