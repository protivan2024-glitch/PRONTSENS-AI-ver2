import { jsPDF } from 'jspdf';
import { RecordDoc, FormField } from '../types';

export async function generateRecordPdf(record: RecordDoc, fields: FormField[]): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Helpers
  const addHeader = (pageNum: number) => {
    // Header background bar
    doc.setFillColor(63, 63, 63); // #3F3F3F
    doc.rect(margin, margin, contentWidth, 22, 'F');

    // Lime accent line
    doc.setFillColor(166, 206, 57); // #A6CE39
    doc.rect(margin, margin + 22, contentWidth, 2, 'F');

    // Title text
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('HSE CONSULTORIA ESPECIALIZADA', margin + 6, margin + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(166, 206, 57);
    doc.text('ProntoSens AI - PRONTUÁRIO DE ATENDIMENTO', margin + 6, margin + 17);

    // Record ID & Status badge on right
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`ID: ${record.id.slice(0, 10).toUpperCase()}`, pageWidth - margin - 6, margin + 10, { align: 'right' });

    let statusBg = [34, 197, 94]; // green
    if (record.status === 'Alerta') statusBg = [245, 158, 11]; // amber
    if (record.status === 'Crítico') statusBg = [239, 68, 68]; // red

    doc.setFillColor(statusBg[0], statusBg[1], statusBg[2]);
    doc.roundedRect(pageWidth - margin - 40, margin + 12, 34, 6, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(record.status.toUpperCase(), pageWidth - margin - 23, margin + 16, { align: 'center' });
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 15) {
      doc.addPage();
      y = margin + 30; // Leave room for header on new page
      addHeader(doc.getNumberOfPages());
    }
  };

  const renderSectionHeader = (title: string) => {
    checkPageBreak(12);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F');
    
    doc.setFillColor(166, 206, 57);
    doc.rect(margin, y, 3, 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(63, 63, 63);
    doc.text(title.toUpperCase(), margin + 6, y + 5.5);
    y += 11;
  };

  const renderFieldValue = (label: string, value: string | string[], fullWidth: boolean = false) => {
    if (label.toLowerCase().includes('foto do teste de reflexo')) {
      // Skip rendering photo as text label/value
      return;
    }

    const valStr = Array.isArray(value) ? value.join(', ') : (value || '---');
    const width = fullWidth ? contentWidth : (contentWidth / 2) - 4;
    
    checkPageBreak(12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(label.toUpperCase(), margin + (fullWidth ? 0 : 0), y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);

    const splitText = doc.splitTextToSize(valStr, width);
    doc.text(splitText, margin + (fullWidth ? 0 : 0), y + 4.5);

    const stepHeight = Math.max(10, (splitText.length * 4) + 6);
    y += stepHeight;
  };

  // Draw First Page Header
  addHeader(1);
  y += 28;

  // Metadata Bar
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  const formattedDate = new Date(record.createdAt).toLocaleString('pt-BR');
  doc.text(`Data do Registro: ${formattedDate}  |  Enviado por: ${record.submittedBy}`, margin, y);
  y += 6;

  // Separate fields by section
  const sections = {
    identificacao: fields.filter(f => f.section === 'identificacao').sort((a,b) => a.order - b.order),
    estimulacao: fields.filter(f => f.section === 'estimulacao').sort((a,b) => a.order - b.order),
    seguranca: fields.filter(f => f.section === 'seguranca').sort((a,b) => a.order - b.order),
    parecer: fields.filter(f => f.section === 'parecer').sort((a,b) => a.order - b.order),
  };

  // 1. Identificação Geral
  renderSectionHeader('1. Identificação Geral');
  sections.identificacao.forEach(field => {
    const rawVal = record.answers[field.id];
    let displayVal = Array.isArray(rawVal) ? rawVal.join(', ') : (rawVal || '');
    
    // Check conditional fields (Empresa Outros, Subcontratada Outros)
    if (field.id === 'f_empresa' && rawVal === 'OUTROS' && record.answers['f_empresa_outro']) {
      displayVal += ` (${record.answers['f_empresa_outro']})`;
    }
    if (field.id === 'f_empresa_sub' && rawVal === 'OUTROS' && record.answers['f_empresa_sub_outro']) {
      displayVal += ` (${record.answers['f_empresa_sub_outro']})`;
    }

    renderFieldValue(field.label, displayVal, true);
  });

  // 2. Estimulação & Resposta Clínica
  renderSectionHeader('2. Estimulação & Resposta Clínica');
  sections.estimulacao.forEach(field => {
    const rawVal = record.answers[field.id];
    let displayVal = Array.isArray(rawVal) ? rawVal.join(', ') : (rawVal || '');

    if (field.id === 'f_medicamento' && rawVal === 'Sim' && record.answers['f_medicamento_nome']) {
      displayVal += ` - Medicamentos: ${record.answers['f_medicamento_nome']}`;
    }

    renderFieldValue(field.label, displayVal, true);
  });

  // 3. Segurança e Inspeção HSE
  renderSectionHeader('3. Segurança e Inspeção HSE');
  sections.seguranca.forEach(field => {
    const rawVal = record.answers[field.id];
    let displayVal = Array.isArray(rawVal) ? rawVal.join(', ') : (rawVal || '');

    renderFieldValue(field.label, displayVal, true);
  });

  // Render Bloqueio/Observação details if applicable
  const statusLib = record.answers['f_status_liberacao'];
  if (statusLib === 'BLOQUEADO PARA ATIVIDADE') {
    if (record.answers['f_categoria_bloqueio']) {
      renderFieldValue('Categoria do Bloqueio', String(record.answers['f_categoria_bloqueio']), true);
    }
    if (record.answers['f_motivo_bloqueio']) {
      renderFieldValue('Motivo do Bloqueio', String(record.answers['f_motivo_bloqueio']), true);
    }
  } else if (statusLib === 'LIBERADO COM OBSERVAÇÃO') {
    if (record.answers['f_motivo_observacao']) {
      renderFieldValue('Motivo / Observação', String(record.answers['f_motivo_observacao']), true);
    }
  }

  // 4. Parecer Técnico & Fechamento
  renderSectionHeader('4. Parecer Técnico & Fechamento');
  sections.parecer.forEach(field => {
    if (field.type === 'photo' || field.id === 'f_foto_reflexo') return; // Rendered in evidence section below
    let rawVal = record.answers[field.id];

    if (field.id === 'f_avaliador') {
      rawVal = record.collaboratorNameSnapshot || String(rawVal);
    }

    let displayVal = Array.isArray(rawVal) ? rawVal.join(', ') : (rawVal || '');
    if (field.type === 'checkbox') {
      displayVal = rawVal ? 'SIM - DECLARAÇÃO CONFIRMADA' : 'NÃO';
    }

    renderFieldValue(field.label, displayVal, true);
  });

  // 5. Evidências Fotográficas Registradas (Only rendered if photos exist)
  if (record.photos && record.photos.length > 0) {
    renderSectionHeader('5. Evidências Fotográficas Registradas');
    for (const photo of record.photos) {
      if (photo.url) {
        checkPageBreak(65);
        try {
          doc.addImage(photo.url, 'JPEG', margin, y, 60, 50);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 80);
          doc.text(photo.caption || 'Evidência fotográfica do atendimento', margin + 65, y + 10);
          y += 55;
        } catch (e) {
          console.warn('Could not render image in PDF:', e);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.text(`[Foto salva em: ${photo.url.slice(0, 40)}...]`, margin, y);
          y += 10;
        }
      }
    }
  }

  // Signature Block at end
  checkPageBreak(35);
  y += 10;
  
  // Empty space above line, line, and evaluator text below
  const lineX = margin + (contentWidth / 4);
  const lineWidth = contentWidth / 2;

  doc.setLineWidth(0.5);
  doc.setDrawColor(120, 120, 120);
  doc.line(lineX, y, lineX + lineWidth, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(63, 63, 63);
  doc.text(record.collaboratorNameSnapshot || 'Avaliador Responsável', pageWidth / 2, y, { align: 'center' });

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('HSE Consultoria Especializada - Assinatura / Parecer Técnico', pageWidth / 2, y, { align: 'center' });

  // Page Numbers Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`ProntoSens AI  |  Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  // Save PDF
  doc.save(`ProntoSens_Prontuario_${record.answers['f_motorista'] || record.id}.pdf`);
}
