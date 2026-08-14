import { jsPDF } from 'jspdf';
import { RecordDoc, FormField } from '../types';

interface CardItem {
  label: string;
  value: string;
  fullWidth?: boolean;
}

interface SectionGroup {
  title: string;
  cards: CardItem[];
}

export async function generateRecordPdf(record: RecordDoc, fields: FormField[]): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186
  const gap = 3;
  const colWidth = (contentWidth - gap) / 2; // 91.5
  let y = margin;

  const answers = record.answers || {};

  // Extract Top Summary Data
  const motoristaName = String(answers['f_motorista'] || answers['f_paciente'] || 'NÃO INFORMADO').toUpperCase();
  const dataNascimento = String(answers['f_data_nascimento'] || answers['f_nascimento'] || '---');
  
  const recordCreated = new Date(record.createdAt || Date.now());
  const recordDateStr = recordCreated.toLocaleDateString('pt-BR');
  const recordTimeStr = recordCreated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const rawDateTime = answers['f_datetime'] ? String(answers['f_datetime']).replace('T', ', ') : `${recordDateStr}, ${recordTimeStr}`;
  
  const colaboradorResp = String(
    record.collaboratorNameSnapshot || 
    answers['f_avaliador'] || 
    record.submittedBy || 
    'COLABORADOR HSE'
  ).toUpperCase();

  // Status computation for header badge
  const statusLiberacao = String(answers['f_status_liberacao'] || record.status || 'CONFORME').toUpperCase();
  const fullStatusText = `STATUS HSE: ${statusLiberacao}`;

  // Top Header rendering
  const renderDocumentHeader = () => {
    y = margin;

    // 1. Logo text "ProntoSens AI"
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(43, 43, 43); // #2B2B2B
    doc.text('ProntoSens', margin, y + 4.5);

    const prontoSensWidth = doc.getTextWidth('ProntoSens');
    doc.setTextColor(166, 206, 57); // #A6CE39 Lime
    doc.text(' AI', margin + prontoSensWidth, y + 4.5);

    // Dark badge "HSE CONSULTORIA"
    const aiWidth = doc.getTextWidth(' AI');
    const badgeX = margin + prontoSensWidth + aiWidth + 3;
    doc.setFillColor(43, 43, 43);
    doc.roundedRect(badgeX, y + 0.5, 34, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text('HSE CONSULTORIA', badgeX + 17, y + 4, { align: 'center' });

    // Status Badge on Top Right
    let statusColor = [22, 163, 74]; // Emerald / Green
    if (statusLiberacao.includes('BLOQUEADO') || statusLiberacao.includes('CRÍTICO')) {
      statusColor = [22, 163, 74]; // In screenshot, it's green-themed STATUS HSE text
    } else if (statusLiberacao.includes('ALERTA') || statusLiberacao.includes('OBSERVAÇÃO')) {
      statusColor = [217, 119, 6];
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.text(fullStatusText, pageWidth - margin, y + 4.5, { align: 'right' });

    // 2. Sub-header Line
    y += 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99); // #4B5563
    doc.text('PRONTUÁRIO CLÍNICO & REGISTRO DE ATENDIMENTO HSE', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175); // #9CA3AF
    doc.text(`ID: ${record.id}`, pageWidth - margin, y, { align: 'right' });

    // Divider Line
    y += 2.5;
    doc.setDrawColor(229, 231, 235); // #E5E7EB
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 3;
  };

  // Top 4-column summary card (Page 1 only)
  const renderTopSummaryCard = () => {
    const cardH = 14;
    doc.setFillColor(250, 250, 250); // #FAFAFA
    doc.setDrawColor(229, 231, 235); // #E5E7EB
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, cardH, 1.5, 1.5, 'FD');

    const colW = contentWidth / 4;
    const summaryItems = [
      { label: 'PACIENTE', value: motoristaName },
      { label: 'DATA DE NASCIMENTO', value: dataNascimento !== '---' ? `${dataNascimento}` : '---' },
      { label: 'DATA/HORA ATENDIMENTO', value: rawDateTime },
      { label: 'COLABORADOR RESPONSÁVEL', value: colaboradorResp },
    ];

    summaryItems.forEach((item, idx) => {
      const colX = margin + idx * colW + 3;
      
      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(107, 114, 128); // #6B7280
      doc.text(item.label, colX, y + 4.5);

      // Value
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(31, 41, 55); // #1F2937
      const valLines = doc.splitTextToSize(item.value, colW - 5);
      doc.text(valLines[0] || '---', colX, y + 9.5);
    });

    y += cardH + 4;
  };

  // Check and trigger page break
  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 14) {
      doc.addPage();
      renderDocumentHeader();
      y += 2;
    }
  };

  // Section Header Pill (Dark background with lime accent)
  const renderSectionHeader = (title: string) => {
    checkPageBreak(12);
    const headerH = 6;
    doc.setFillColor(43, 43, 43); // #2B2B2B
    doc.roundedRect(margin, y, contentWidth, headerH, 1, 1, 'F');

    // Lime accent bar
    doc.setFillColor(166, 206, 57); // #A6CE39
    doc.rect(margin, y, 2.5, headerH, 'F');

    // Section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 4.5, y + 4.2);

    y += headerH + 2.5;
  };

  // Render Grid of Cards (2 columns or full width)
  const renderCardGrid = (items: CardItem[]) => {
    let i = 0;
    while (i < items.length) {
      const item1 = items[i];
      const isFullWidth = item1.fullWidth || false;

      if (isFullWidth) {
        // Calculate needed height based on value length
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const splitVal = doc.splitTextToSize(item1.value || '---', contentWidth - 6);
        const dynamicH = Math.max(12, 6.5 + splitVal.length * 3.8);

        checkPageBreak(dynamicH + 2);

        // Draw Card Box
        doc.setFillColor(250, 250, 250);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, contentWidth, dynamicH, 1.5, 1.5, 'FD');

        // Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(107, 114, 128);
        doc.text(item1.label.toUpperCase(), margin + 3, y + 4);

        // Value
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);
        doc.text(splitVal, margin + 3, y + 8.5);

        y += dynamicH + 2;
        i++;
      } else {
        const item2 = (i + 1 < items.length && !items[i + 1].fullWidth) ? items[i + 1] : null;

        // Measure height for 1 or 2 cards
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const splitVal1 = doc.splitTextToSize(item1.value || '---', colWidth - 6);
        const splitVal2 = item2 ? doc.splitTextToSize(item2.value || '---', colWidth - 6) : [];
        const maxLines = Math.max(splitVal1.length, splitVal2.length, 1);
        const rowH = Math.max(12, 6.5 + maxLines * 3.8);

        checkPageBreak(rowH + 2);

        // Render Col 1
        doc.setFillColor(250, 250, 250);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, colWidth, rowH, 1.5, 1.5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(107, 114, 128);
        doc.text(item1.label.toUpperCase(), margin + 3, y + 4);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);
        doc.text(splitVal1, margin + 3, y + 8.5);

        // Render Col 2 if present
        if (item2) {
          const col2X = margin + colWidth + gap;
          doc.setFillColor(250, 250, 250);
          doc.setDrawColor(229, 231, 235);
          doc.roundedRect(col2X, y, colWidth, rowH, 1.5, 1.5, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(107, 114, 128);
          doc.text(item2.label.toUpperCase(), col2X + 3, y + 4);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(31, 41, 55);
          doc.text(splitVal2, col2X + 3, y + 8.5);

          i += 2;
        } else {
          i += 1;
        }

        y += rowH + 2;
      }
    }
  };

  // Build Sections and Card Data according to standard form structure
  const buildSections = (): SectionGroup[] => {
    // 1. Identificação Geral
    const idCards: CardItem[] = [
      { label: 'ENDEREÇO DA SALA DE ESTIMULAÇÃO', value: String(answers['f_sala'] || '---'), fullWidth: true },
      { label: 'EMPRESA', value: String(answers['f_empresa'] || '---') },
    ];

    if (answers['f_empresa'] === 'OUTROS' || answers['f_empresa_outro']) {
      idCards.push({ label: 'EMPRESA (OUTROS ESPECIFICADO)', value: String(answers['f_empresa_outro'] || '---') });
    }

    idCards.push({ label: 'EMPRESA SUB-CONTRATADA', value: String(answers['f_empresa_sub'] || '---') });

    if (answers['f_empresa_sub'] === 'OUTROS' || answers['f_empresa_sub_outro']) {
      idCards.push({ label: 'SUBCONTRATADA (OUTROS ESPECIFICADO)', value: String(answers['f_empresa_sub_outro'] || '---') });
    }

    idCards.push(
      { label: 'DATA E HORA DO ATENDIMENTO', value: rawDateTime },
      { label: 'HORÁRIO DE INÍCIO (ATENDIMENTO)', value: String(answers['f_time_start'] || recordTimeStr) },
      { label: 'NOME DO MOTORISTA', value: motoristaName },
      { label: 'CICLO DA ESCALA DO MOTORISTA', value: String(answers['f_ciclo_escala'] || '---') },
      { label: 'HORA ESCALA', value: String(answers['f_hora_escala'] || '---') }
    );

    // 2. Estimulação & Resposta Clínica
    const clinicaCards: CardItem[] = [
      { label: 'TEMPERATURA AFERIDA', value: String(answers['f_temp'] || '---') },
      { label: 'NÍVEL DE TEMPERATURA', value: String(answers['f_nivel_temp'] || 'NORMAL') },
      { label: 'NÍVEL DE FADIGA', value: String(answers['f_fadiga'] || '---') },
      { label: 'TESTE DE PERCEPÇÃO', value: String(answers['f_percepcao'] || '---') },
      { label: 'PRESSÃO ARTERIAL', value: String(answers['f_pressao'] || '---') },
      { label: 'NÍVEL DE PRESSÃO', value: String(answers['f_nivel_pressao'] || 'NORMAL') },
      { label: 'FAZ USO DE MEDICAMENTO?', value: String(answers['f_medicamento'] || 'NÃO').toUpperCase() },
    ];

    if (answers['f_medicamento'] === 'Sim' || answers['f_medicamento_nome']) {
      clinicaCards.push({ 
        label: 'NOME DO(S) MEDICAMENTO(S)', 
        value: String(answers['f_medicamento_nome'] || '---'), 
        fullWidth: true 
      });
    }

    // 3. Segurança e Inspeção HSE
    const segurancaCards: CardItem[] = [
      { label: 'STATUS DE LIBERAÇÃO', value: statusLiberacao },
    ];

    if (statusLiberacao.includes('BLOQUEADO')) {
      if (answers['f_categoria_bloqueio']) {
        segurancaCards.push({ label: 'CATEGORIA DO BLOQUEIO DE ATIVIDADE', value: String(answers['f_categoria_bloqueio']) });
      }
      if (answers['f_motivo_bloqueio']) {
        segurancaCards.push({ label: 'MOTIVO DO STATUS / BLOQUEIO DE ATIVIDADE', value: String(answers['f_motivo_bloqueio']), fullWidth: true });
      }
    } else if (statusLiberacao.includes('OBSERVAÇÃO')) {
      if (answers['f_motivo_observacao']) {
        segurancaCards.push({ label: 'MOTIVO DA OBSERVAÇÃO', value: String(answers['f_motivo_observacao']), fullWidth: true });
      }
    }

    // 4. Parecer Técnico & Fechamento
    const durationMinutes = record.durationMinutes || 0;
    let durationFormatted = '---';
    if (durationMinutes > 0) {
      const hrs = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      durationFormatted = hrs > 0 ? `${hrs}h ${mins}min (${durationMinutes} min)` : `${mins} min`;
    }

    const parecerCards: CardItem[] = [
      { label: 'AVALIADOR', value: colaboradorResp },
      { label: 'HORÁRIO FINAL DO ATENDIMENTO', value: String(answers['f_time_end'] || '---') },
      { label: 'PERÍODO DE PROCEDIMENTO (DURAÇÃO ...', value: durationFormatted, fullWidth: true }
    ];

    return [
      { title: 'IDENTIFICAÇÃO GERAL', cards: idCards },
      { title: 'ESTIMULAÇÃO & RESPOSTA CLÍNICA', cards: clinicaCards },
      { title: 'SEGURANÇA E INSPEÇÃO HSE', cards: segurancaCards },
      { title: 'PARECER TÉCNICO & FECHAMENTO', cards: parecerCards },
    ];
  };

  // 1. Initial Page Header & Summary
  renderDocumentHeader();
  renderTopSummaryCard();

  // 2. Render Form Sections
  const sections = buildSections();
  for (const section of sections) {
    renderSectionHeader(section.title);
    renderCardGrid(section.cards);
    y += 1.5;
  }

  // 3. Render Evidências Fotográficas (if any photos exist)
  const photos = record.photos || [];
  // Also check if any photo in answers
  const photoKeys = Object.entries(answers).filter(([k, v]) => 
    k.toLowerCase().includes('foto') && typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http'))
  );

  if (photos.length > 0 || photoKeys.length > 0) {
    renderSectionHeader('EVIDÊNCIAS FOTOGRÁFICAS REGISTRADAS');

    // Collect all valid photo entries
    const allPhotos: { url: string; caption: string }[] = [];
    photos.forEach(p => {
      if (p.url && !p.url.includes('expurgada')) {
        allPhotos.push({ url: p.url, caption: p.caption || 'FOTO DO TESTE DE REFLEXO' });
      }
    });

    photoKeys.forEach(([k, v]) => {
      if (typeof v === 'string' && !allPhotos.some(p => p.url === v)) {
        allPhotos.push({ url: v, caption: 'FOTO DO TESTE DE REFLEXO' });
      }
    });

    if (allPhotos.length > 0) {
      for (const p of allPhotos) {
        checkPageBreak(58);

        // Photo card container
        const cardBoxW = 75;
        const cardBoxH = 50;
        
        doc.setFillColor(250, 250, 250);
        doc.setDrawColor(229, 231, 235);
        doc.roundedRect(margin, y, cardBoxW, cardBoxH, 1.5, 1.5, 'FD');

        try {
          // Render Image inside box
          doc.addImage(p.url, 'JPEG', margin + 2, y + 2, cardBoxW - 4, cardBoxH - 12);
        } catch (imgErr) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor(156, 163, 175);
          doc.text('[Imagem do teste anexada]', margin + 5, y + 20);
        }

        // Caption label below image
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(75, 85, 99);
        doc.text(p.caption.toUpperCase(), margin + (cardBoxW / 2), y + cardBoxH - 3, { align: 'center' });

        y += cardBoxH + 4;
      }
    }
  }

  // 4. Signatures Section on the Last Page
  checkPageBreak(30);
  y = Math.max(y + 8, pageHeight - margin - 35); // Anchor toward lower part of last page

  const sigWidth = 72;
  const leftSigX = margin + 8;
  const rightSigX = margin + contentWidth - sigWidth - 8;

  // Left Signature Line
  doc.setDrawColor(209, 213, 219); // #D1D5DB
  doc.setLineWidth(0.4);
  doc.line(leftSigX, y, leftSigX + sigWidth, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(43, 43, 43);
  doc.text(colaboradorResp, leftSigX + (sigWidth / 2), y + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(156, 163, 175);
  doc.text('COLABORADOR RESPONSÁVEL / EXECUTANTE', leftSigX + (sigWidth / 2), y + 8, { align: 'center' });

  // Right Signature Line
  doc.line(rightSigX, y, rightSigX + sigWidth, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(43, 43, 43);
  doc.text('SUPERVISÃO TÉCNICA HSE', rightSigX + (sigWidth / 2), y + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(156, 163, 175);
  doc.text('VALIDAÇÃO DE SEGURANÇA E CONFORMIDADE', rightSigX + (sigWidth / 2), y + 8, { align: 'center' });

  // 5. Render Standardized Footer on every single page
  const totalPages = doc.getNumberOfPages();
  const submissionEmail = record.submittedBy || 'marketing.hseconsultoria@gmail.com';
  const nowFormatted = new Date().toLocaleString('pt-BR');

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(156, 163, 175);

    const footerLeftText = `Enviado por: HSE Soluções (${submissionEmail}) em ${recordDateStr}, ${recordTimeStr} | ProntoSens AI - Confidencial`;
    doc.text(footerLeftText, margin, footerY);

    const pageText = `Página ${i}`;
    doc.text(pageText, pageWidth - margin, footerY, { align: 'right' });
  }

  // Save PDF file
  const cleanMotorista = motoristaName.replace(/[^A-Z0-9]/gi, '_').slice(0, 25);
  const fileName = `Prontuario_${cleanMotorista}_${record.id.slice(0, 8)}.pdf`;
  doc.save(fileName);
}
