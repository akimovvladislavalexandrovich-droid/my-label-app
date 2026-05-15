window.addEventListener('DOMContentLoaded', () => {
    fabric.Text.prototype.textBaseline = 'alphabetic';
    fabric.Textbox.prototype.textBaseline = 'alphabetic';

    const originalCalcTextHeight = fabric.Textbox.prototype.calcTextHeight;
    fabric.Textbox.prototype.calcTextHeight = function() {
        const textH = originalCalcTextHeight.call(this);
        return this.customHeight ? Math.max(textH, this.customHeight) : textH;
    };

    fabric.Textbox.prototype._getTopOffset = function() {
        const actualTextHeight = originalCalcTextHeight.call(this);
        let top = -this.height / 2;
        if (this.height > actualTextHeight) {
            top += (this.height - actualTextHeight) / 2;
        }
        return top;
    };
    
    const originalToSVG = fabric.Textbox.prototype.toSVG;
    fabric.Textbox.prototype.toSVG = function(reviver) {
        let svgStr = originalToSVG.call(this, reviver);
        const actualTextHeight = originalCalcTextHeight.call(this);
        if (this.customHeight && this.customHeight > actualTextHeight) {
            const offset = (this.customHeight - actualTextHeight) / 2;
            svgStr = svgStr.replace(/(<text[\s\S]*?<\/text>)/g, `<g transform="translate(0, ${offset})">$1</g>`);
        }
        return svgStr;
    };
    
    // const pxPerMm = 3.78 * 2;
    // const pxPerMm = 8;
    // Замените ваши константы на этот блок:
    const DPI = 720; 
    const pxPerMm = DPI / 25.4;

    // Физический минимум узкой линии штрихкода (в миллиметрах)
    const MIN_MODULE_WIDTH_MM = 0.17; 
    // Математический расчет минимального Scale (в пикселях)
    const MIN_SCALE = Math.max(1, Math.ceil(MIN_MODULE_WIDTH_MM * pxPerMm));
    // const DPI = 720;
    // const pxPerMm = DPI / 25.4; // 7.99212598...
    let globalWorkbook = null;
    const KIZ_PLACEHOLDER = "01046106385308152159/V?,ORZe.n! 91EE11 92IxY135Gwv5yE0RUyVffncQwx2uVRm2eoz1Ng2DNSn3A=";

    const savedUrl = localStorage.getItem('sheetUrl');
    if (savedUrl) document.getElementById('sheetUrl').value = savedUrl;

    // const canvas = new fabric.Canvas('labelCanvas', { backgroundColor: '#ffffff', preserveObjectStacking: true });
    const canvas = new fabric.Canvas('labelCanvas', { backgroundColor: '#ffffff', preserveObjectStacking: true });
    
    // ДОБАВИТЬ ЭТО: Убиваем дробные координаты при любом движении
    canvas.on('object:moving', (e) => {
        if (e.target) {
            e.target.set({ left: Math.round(e.target.left), top: Math.round(e.target.top) });
        }
    });
    canvas.on('object:scaling', (e) => {
        if (e.target) {
            e.target.set({ left: Math.round(e.target.left), top: Math.round(e.target.top) });
        }
    });
    const showAlert = (msg) => alert(msg);

    const updateCanvasSize = () => {
        const wMm = parseFloat(document.getElementById('labelWidth').value) || 120;
        const hMm = parseFloat(document.getElementById('labelHeight').value) || 70;
        canvas.setDimensions({ width: wMm * pxPerMm, height: hMm * pxPerMm });
        
        const wrapper = document.getElementById('canvasWrapper');
        const shadow = document.getElementById('canvasShadow');
        let scale = Math.min((wrapper.clientWidth * 0.85) / (wMm * pxPerMm), (wrapper.clientHeight * 0.85) / (hMm * pxPerMm));
        shadow.style.transform = `scale(${Math.min(scale, 1.5)})`;
        canvas.renderAll();
    };
    document.getElementById('labelWidth').addEventListener('input', updateCanvasSize);
    document.getElementById('labelHeight').addEventListener('input', updateCanvasSize);
    window.addEventListener('resize', updateCanvasSize);
    setTimeout(updateCanvasSize, 100);

    const autoFitText = (obj) => {
        if (obj.customType !== 'text') return;
        let currentFontSize = obj.baseFontSize || 20;
        obj.set('fontSize', currentFontSize);
        canvas.renderAll();
        
        const maxLines = obj.maxLines || 1; 
        while (currentFontSize > 6) {
            let isOverflowing = false;
            
            const actualTextH = originalCalcTextHeight.call(obj);
            
            if (obj.customHeight && actualTextH > obj.customHeight) isOverflowing = true;
            if (obj.boxWidth && obj.width > obj.boxWidth) isOverflowing = true;
            if (obj.textLines && obj.textLines.length > maxLines) isOverflowing = true;
            
            if (!isOverflowing) break;
            
            currentFontSize -= 1;
            obj.set('fontSize', currentFontSize);
            canvas.renderAll();
        }
    };
    const updateCode = (obj, callback) => {
        let val = obj.dataValue || (obj.customType === 'datamatrix' ? KIZ_PLACEHOLDER : '2037243335666');
        try {
            // let scaleLevel = Math.max(1, Math.round(obj.currentScaleLevel || 3));
            let scaleLevel = Math.max(MIN_SCALE, Math.round(obj.currentScaleLevel || MIN_SCALE));

            let bwipOpts = {
                bcid: obj.customType === 'barcode' ? 'code128' : 'datamatrix',
                scale: scaleLevel,       
                // ДОБАВЛЯЕМ ЖЕСТКИЙ НУЛЕВОЙ ОТСТУП
                paddingwidth: 0, 
                paddingheight: 0,
                includetext: obj.customType === 'barcode' ? (obj.showText !== false) : false,     
                textsize: obj.baseFontSize || 10,
                textxalign: obj.textPos || 'center',
                textyoffset: parseFloat(obj.textOffset) || 1,
                barcolor: '000000', 
                backgroundcolor: 'ffffff',
                fontfamily: obj.fontFamily || 'Arial',
                fontweight: obj.fontWeight || 'normal'
            };

            if (obj.customType === 'datamatrix') {
                bwipOpts.parsefnc = true; 
                let safeVal = String(val);
                safeVal = safeVal.replace(/[\x00-\x1C\x1E\x1F]/g, '');
                safeVal = safeVal.replace(/\^/g, '^^');
                safeVal = safeVal.replace(/_x001[dD]_/g, '^FNC1');
                safeVal = safeVal.replace(/[\x1D\u001D]/g, '^FNC1');
                bwipOpts.text = '^FNC1' + safeVal;
            } else {
                bwipOpts.text = String(val);
                bwipOpts.height = obj.barcodeHeight || 15;
            }

            let svgStr = bwipjs.toSVG(bwipOpts);
            // ==========================================================
            // 🔥 УМНЫЙ УЖИРНИТЕЛЬ ЛИНИЙ (Bar Width Adjustment) 🔥
            // ==========================================================
            let strokeFatness = 0;
            
            // Если масштаб меньше 6, начинаем ужирнять. Чем меньше код, тем больше жира.
            // При 720 DPI масштаб 1-4 дает слишком тонкие физические линии.
            if (scaleLevel < 6) {
                strokeFatness = (6 - scaleLevel) * 0.4; // Коэффициент жирности (подбирается опытным путем)
                
                // Если это DataMatrix, ужирняем меньше, иначе сольются квадратики
                if (obj.customType === 'datamatrix') {
                    strokeFatness = strokeFatness; 
                }
            }

            // Внедряем CSS обводку прямо внутрь сгенерированного SVG.
            // stroke расширяет черную линию во все стороны, съедая белый пробел.
            if (strokeFatness > 0) {
                const styleTag = `<style>rect, path { stroke: #000000; stroke-width: ${strokeFatness}px; }</style>`;
                svgStr = svgStr.replace(/<svg[^>]*>/, (match) => `${match}${styleTag}`);
            }

            // АВТОПОДГОНКА (решает проблему сканирования длинных слов, например из 13 символов)
            let match = svgStr.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
            if (match) {
                let actualWidth = parseFloat(match[1]);
                let maxAllowedWidth = canvas.width - obj.left - 10; 

                // Если штрихкод шире этикетки, понижаем масштаб на 1 целый шаг
                while (actualWidth > maxAllowedWidth && scaleLevel > MIN_SCALE) {
                    scaleLevel -= 1;
                    bwipOpts.scale = scaleLevel;
                    svgStr = bwipjs.toSVG(bwipOpts);
                    match = svgStr.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
                    actualWidth = match ? parseFloat(match[1]) : actualWidth;
                }
                // while (actualWidth > maxAllowedWidth && scaleLevel > 1) {
                //     scaleLevel -= 1;
                //     bwipOpts.scale = scaleLevel;
                //     svgStr = bwipjs.toSVG(bwipOpts);
                //     match = svgStr.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
                //     actualWidth = match ? parseFloat(match[1]) : actualWidth;
                // }
                obj.currentScaleLevel = scaleLevel; // Запоминаем подобранный безопасный масштаб
            }

            // ВАЖНО: Вшиваем crispEdges и УБИРАЕМ preserveAspectRatio="none"
            match = svgStr.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
            if (match) {
                svgStr = svgStr.replace('<svg ', `<svg width="${match[1]}" height="${match[2]}" shape-rendering="crispEdges" `);
            }

            // const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
            // obj.setSrc(dataUrl, () => {
            //     if (obj._element) obj.set({ width: obj._element.width, height: obj._element.height });
            //     obj.set({ scaleX: 1, scaleY: 1 });
            //     canvas.renderAll();
            //     if (callback) callback();
            // });
            const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
            obj.setSrc(dataUrl, () => {
                if (obj._element) {
                    obj.set({ width: obj._element.width, height: obj._element.height });
                }
                // ФИНАЛЬНОЕ УНИЧТОЖЕНИЕ ДРОБЕЙ И ОБВОДОК
                obj.set({ 
                    scaleX: 1, 
                    scaleY: 1,
                    left: Math.round(obj.left),
                    top: Math.round(obj.top),
                    strokeWidth: 0, 
                    stroke: null
                });
                canvas.renderAll();
                if (callback) callback();
            });
        } catch(e) { 
            const errorSvg = `<svg width="50" height="50" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="50" height="50" fill="red"/><text x="5" y="25" fill="white" font-size="12" font-family="Arial">ERROR</text></svg>`;
            const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(errorSvg);
            obj.setSrc(dataUrl, () => {
                if (obj._element) obj.set({ width: 50, height: 50 });
                canvas.renderAll();
                if (callback) callback();
            });
        }
    };
    // const updateCode = (obj, callback) => {
    //     let val = obj.dataValue || (obj.customType === 'datamatrix' ? KIZ_PLACEHOLDER : '12345678');
    //     try {
    //         let bwipOpts = {
    //             bcid: obj.customType === 'barcode' ? 'code128' : 'datamatrix',
    //             scale: obj.currentScaleLevel || 3,       
    //             includetext: obj.customType === 'barcode' ? (obj.showText !== false) : false,     
    //             textsize: obj.baseFontSize || 10,
    //             textxalign: obj.textPos || 'center',
    //             textyoffset: parseFloat(obj.textOffset) || 1,
    //             barcolor: '000000', 
    //             backgroundcolor: 'ffffff',
    //             fontfamily: obj.fontFamily || 'Arial',
    //             fontweight: obj.fontWeight || 'normal'
    //         };

    //         if (obj.customType === 'datamatrix') {
    //             bwipOpts.parsefnc = true; 
    //             let safeVal = String(val);
    //             safeVal = safeVal.replace(/[\x00-\x1C\x1E\x1F]/g, '');
    //             safeVal = safeVal.replace(/\^/g, '^^');
    //             safeVal = safeVal.replace(/_x001[dD]_/g, '^FNC1');
    //             safeVal = safeVal.replace(/[\x1D\u001D]/g, '^FNC1');
    //             bwipOpts.text = '^FNC1' + safeVal;
    //         } else {
    //             bwipOpts.text = String(val);
    //             bwipOpts.height = obj.barcodeHeight || 15;
    //         }

    //         let svgStr = bwipjs.toSVG(bwipOpts);

    //         const match = svgStr.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    //         if (match) {
    //             svgStr = svgStr.replace('<svg ', `<svg width="${match[1]}" height="${match[2]}" shape-rendering="crispEdges" preserveAspectRatio="none" `);
    //             // svgStr = svgStr.replace('<svg ', `<svg width="${match[1]}" height="${match[2]}" `);
    //         }

    //         const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    //         obj.setSrc(dataUrl, () => {
    //             if (obj._element) obj.set({ width: obj._element.width, height: obj._element.height });
    //             obj.set({ scaleX: 1, scaleY: 1 });
    //             canvas.renderAll();
    //             if (callback) callback();
    //         });
    //     } catch(e) { 
    //         const errorSvg = `<svg width="50" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50" fill="red"/><text x="5" y="25" fill="white" font-size="12" font-family="Arial">ERROR</text></svg>`;
    //         const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(errorSvg);
    //         obj.setSrc(dataUrl, () => {
    //             if (obj._element) obj.set({ width: 50, height: 50 });
    //             canvas.renderAll();
    //             if (callback) callback();
    //         });
    //     }
    // };

    const attachScaleEvent = (obj) => {
        obj.setControlVisible('mtr', false);
        obj.lockRotation = true;
        obj.off('scaling'); 
        
        if (obj.customType === 'text') {
            obj.setControlsVisibility({ mtr: false, mt: true, mb: true, ml: true, mr: true });
            obj.on('scaling', function() {
                this.boxWidth = Math.max(10, this.width * this.scaleX);
                this.customHeight = Math.max(10, this.height * this.scaleY);
                this.set({ width: this.boxWidth, height: this.customHeight, scaleX: 1, scaleY: 1 });
                autoFitText(this);
            });
        } else if (obj.customType === 'svg') {
        } else {
            obj.on('scaling', function() {
                // Блокируем сжатие ниже MIN_SCALE
                this.currentScaleLevel = Math.max(MIN_SCALE, Math.round(this.scaleX * (this.currentScaleLevel || MIN_SCALE)));
                
                if (this.scaleY !== 1 && this.customType === 'barcode') {
                    this.barcodeHeight = Math.max(5, (this.barcodeHeight || 15) * this.scaleY);
                }
                this.set({ scaleX: 1, scaleY: 1 });
                updateCode(this);
            });
        }
        // } else if (obj.customType === 'svg') {
        // } else {
        //     obj.on('scaling', function() {
        //         // ИСПРАВЛЕНИЕ: Масштаб только целыми числами (1, 2, 3...)
        //         this.currentScaleLevel = Math.max(1, Math.round(this.scaleX * (this.currentScaleLevel || 3)));
                
        //         if (this.scaleY !== 1 && this.customType === 'barcode') {
        //             this.barcodeHeight = Math.max(5, (this.barcodeHeight || 15) * this.scaleY);
        //         }
        //         this.set({ scaleX: 1, scaleY: 1 });
        //         updateCode(this);
        //     });
        // }
        // } else if (obj.customType === 'svg') {
        // } else {
        //     obj.on('scaling', function() {
        //         const step = 1; // Или 0.125, идеальное попадание в аппаратную сетку 203 DPI
        //         this.currentScaleLevel = Math.max(1, Math.round((this.scaleX * (this.currentScaleLevel || 3)) / step) * step);
        //         // this.currentScaleLevel = Math.max(1, Math.round(this.scaleX * (this.currentScaleLevel || 3)));
        //         // this.currentScaleLevel = Math.max(1, this.scaleX * (this.currentScaleLevel || 3));
        //         if (this.scaleY !== 1 && this.customType === 'barcode') {
        //             this.barcodeHeight = Math.max(5, (this.barcodeHeight || 15) * this.scaleY);
        //         }
        //         this.set({ scaleX: 1, scaleY: 1 });
        //         updateCode(this);
        //     });
        // }
    };

    document.getElementById('addTextBtn').addEventListener('click', () => {
        const t = new fabric.Textbox('ТЕКСТ', {
            left: 50, top: 50, width: 250, height: 60,
            fontSize: 30, baseFontSize: 30, fontFamily: 'Arial', fontWeight: 'bold',
            textAlign: 'center', customType: 'text', splitByGrapheme: true, maxLines: 1, inverted: false
        });
        t.boxWidth = 250; t.customHeight = 60;
        attachScaleEvent(t); canvas.add(t).setActiveObject(t);
    });

    document.getElementById('addBarcodeBtn').addEventListener('click', () => {
        const blankSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="10" height="10"></svg>');
        fabric.Image.fromURL(blankSvg, (img) => {
            img.set({ 
                left: 50, top: 50, 
                // Стартуем с комфортного размера (например, минимум + 2 шага)
                currentScaleLevel: MIN_SCALE + 2, 
                barcodeHeight: 15, dataValue: '2037243335666', 
                customType: 'barcode', showText: true, baseFontSize: 10, textOffset: 1, textPos: 'center', fontFamily: 'Arial', fontWeight: 'bold' 
            });
            attachScaleEvent(img); canvas.add(img).setActiveObject(img); updateCode(img);
        });
    });

    document.getElementById('addDataMatrixBtn').addEventListener('click', () => {
        const blankSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="10" height="10"></svg>');
        fabric.Image.fromURL(blankSvg, (img) => {
            img.set({ 
                left: 50, top: 50, 
                // Для DataMatrix тоже задаем умный старт
                currentScaleLevel: MIN_SCALE + 2, 
                dataValue: KIZ_PLACEHOLDER, customType: 'datamatrix'
            });
            attachScaleEvent(img); canvas.add(img).setActiveObject(img); updateCode(img);
        });
    });

    // document.getElementById('addBarcodeBtn').addEventListener('click', () => {
    //     const blankSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="10" height="10"></svg>');
    //     fabric.Image.fromURL(blankSvg, (img) => {
    //         img.set({ 
    //             left: 50, top: 50, currentScaleLevel: 3, barcodeHeight: 15, dataValue: '2037243335666', 
    //             customType: 'barcode', showText: true, baseFontSize: 10, textOffset: 1, textPos: 'center', fontFamily: 'Arial', fontWeight: 'bold' 
    //         });
    //         attachScaleEvent(img); canvas.add(img).setActiveObject(img); updateCode(img);
    //     });
    // });

    // document.getElementById('addDataMatrixBtn').addEventListener('click', () => {
    //     const blankSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="10" height="10"></svg>');
    //     fabric.Image.fromURL(blankSvg, (img) => {
    //         img.set({ 
    //             left: 50, top: 50, currentScaleLevel: 3, dataValue: KIZ_PLACEHOLDER, customType: 'datamatrix'
    //         });
    //         attachScaleEvent(img); canvas.add(img).setActiveObject(img); updateCode(img);
    //     });
    // });

    document.getElementById('addSvgBtn').addEventListener('click', () => document.getElementById('svgFileInput').click());
    document.getElementById('svgFileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                img.set({ left: 50, top: 50, customType: 'svg', src: f.target.result });
                attachScaleEvent(img);
                canvas.add(img);
                canvas.setActiveObject(img);
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    const deleteSelected = () => { const obj = canvas.getActiveObject(); if (obj) { canvas.remove(obj); canvas.discardActiveObject(); syncProps(); } };
    document.getElementById('deleteObjBtn').addEventListener('click', deleteSelected);
    
    window.addEventListener('keydown', (e) => { 
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        const obj = canvas.getActiveObject(); if (!obj) return;
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
        else if (e.key === 'ArrowUp') { obj.set('top', obj.top - step); canvas.renderAll(); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { obj.set('top', obj.top + step); canvas.renderAll(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { obj.set('left', obj.left - step); canvas.renderAll(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { obj.set('left', obj.left + step); canvas.renderAll(); e.preventDefault(); }
    });

    const syncProps = () => {
        const obj = canvas.getActiveObject();
        const alignPanel = document.getElementById('alignPanel');
        const multiAlignPanel = document.getElementById('multiAlignPanel');
        const propControls = document.getElementById('propControls');
        const noSelection = document.getElementById('noSelection');

        alignPanel.style.display = obj && obj.type !== 'activeSelection' ? 'block' : 'none';
        multiAlignPanel.style.display = obj && obj.type === 'activeSelection' ? 'block' : 'none';

        if (!obj) { propControls.style.display = 'none'; noSelection.style.display = 'block'; return; }
        propControls.style.display = 'block'; noSelection.style.display = 'none';

        if (obj.customType === 'svg') {
            document.getElementById('dataSourceSettings').style.display = 'none';
            document.getElementById('codeTextSettings').style.display = 'none';
            document.getElementById('fontSettings').style.display = 'none';
            return;
        } else {
            document.getElementById('dataSourceContainer').style.display = 'block';
            document.getElementById('fontSettings').style.display = 'block';
        }

        if (obj.type === 'activeSelection') {
            const allText = obj.getObjects().every(o => o.customType === 'text');
            document.getElementById('dataSourceContainer').style.display = 'none';
            document.getElementById('codeTextSettings').style.display = 'none';
            document.getElementById('textOnlySettings').style.display = allText ? 'block' : 'none';
            
            if (allText && obj.getObjects().length > 0) {
                document.getElementById('fontFamilySelect').value = obj.getObjects()[0].fontFamily || 'Arial';
                document.getElementById('fontWeightSelect').value = obj.getObjects()[0].fontWeight || 'normal';
            }
            return; 
        }

        document.getElementById('dataType').value = obj.isDynamic ? 'dynamic' : 'static';
        document.getElementById('dynamicFieldDiv').style.display = obj.isDynamic ? 'block' : 'none';
        document.getElementById('fieldSelector').value = obj.mappedField || "";
        document.getElementById('objText').value = (obj.customType === 'text') ? obj.text : (obj.dataValue || "");
        document.getElementById('fontSizeInput').value = obj.baseFontSize || obj.fontSize || 20;

        const isText = obj.customType === 'text';
        document.getElementById('textOnlySettings').style.display = isText ? 'block' : 'none';
        if (isText) {
            document.getElementById('fontFamilySelect').value = obj.fontFamily || 'Arial';
            document.getElementById('fontWeightSelect').value = obj.fontWeight || 'normal';
            document.getElementById('textAlignText').value = obj.textAlign || 'center';
            document.getElementById('maxLinesSelect').value = obj.maxLines || 1;
            document.getElementById('invertTextSelect').value = String(obj.inverted || false);
        }

        const isCode = (obj.customType === 'barcode'); 
        document.getElementById('codeTextSettings').style.display = isCode ? 'block' : 'none';
        if (isCode) {
            document.getElementById('showCodeText').value = String(obj.showText !== false);
            document.getElementById('textOffset').value = obj.textOffset || 1;
            document.getElementById('textAlignCode').value = obj.textPos || 'center';
        }
    };

    canvas.on('selection:created', syncProps); canvas.on('selection:updated', syncProps); canvas.on('selection:cleared', syncProps);

    document.getElementById('alignCanvasLeft').addEventListener('click', () => { const obj = canvas.getActiveObject(); if (obj) { obj.set({left: 0}); canvas.renderAll(); }});
    document.getElementById('alignCanvasCenterH').addEventListener('click', () => { const obj = canvas.getActiveObject(); if (obj) { obj.centerH(); canvas.renderAll(); }});
    document.getElementById('alignCanvasRight').addEventListener('click', () => { const obj = canvas.getActiveObject(); if (obj) { obj.set({left: canvas.width - obj.getScaledWidth()}); canvas.renderAll(); }});
    document.getElementById('alignCanvasTop').addEventListener('click', () => { const obj = canvas.getActiveObject(); if (obj) { obj.set({top: 0}); canvas.renderAll(); }});
    document.getElementById('alignCanvasCenterV').addEventListener('click', () => { const obj = canvas.getActiveObject(); if (obj) { obj.centerV(); canvas.renderAll(); }});
    document.getElementById('alignCanvasBottom').addEventListener('click', () => { const obj = canvas.getActiveObject(); if (obj) { obj.set({top: canvas.height - obj.getScaledHeight()}); canvas.renderAll(); }});

    document.getElementById('alignMultiLeft').addEventListener('click', () => { const sel = canvas.getActiveObject(); if (sel && sel.type === 'activeSelection') { const minX = Math.min(...sel._objects.map(o => o.left)); sel._objects.forEach(o => o.set({left: minX})); canvas.renderAll(); }});
    document.getElementById('alignMultiCenter').addEventListener('click', () => { const sel = canvas.getActiveObject(); if (sel && sel.type === 'activeSelection') { sel._objects.forEach(o => o.set({left: -o.getScaledWidth() / 2})); canvas.renderAll(); }});
    document.getElementById('alignMultiRight').addEventListener('click', () => { const sel = canvas.getActiveObject(); if (sel && sel.type === 'activeSelection') { const maxX = Math.max(...sel._objects.map(o => o.left + o.getScaledWidth())); sel._objects.forEach(o => o.set({left: maxX - o.getScaledWidth()})); canvas.renderAll(); }});

    const applyToSelection = (key, value, needsTextFit = false, needsCodeUpdate = false) => {
        const obj = canvas.getActiveObject(); if (!obj) return;
        const targets = obj.type === 'activeSelection' ? obj.getObjects() : [obj];
        targets.forEach(t => {
            if (key === 'inverted' && t.customType === 'text') {
                t.inverted = value;
                t.set({ backgroundColor: value ? '#000000' : '', fill: value ? '#ffffff' : '#000000' });
            } else {
                t.set(key, value);
            }
            if (needsTextFit && t.customType === 'text') autoFitText(t);
            if (needsCodeUpdate && t.customType !== 'text' && t.customType !== 'svg') updateCode(t);
        });
        canvas.renderAll();
    };

    document.getElementById('fontFamilySelect').addEventListener('change', (e) => applyToSelection('fontFamily', e.target.value, true, true));
    document.getElementById('fontWeightSelect').addEventListener('change', (e) => applyToSelection('fontWeight', e.target.value, true, true));
    document.getElementById('fontSizeInput').addEventListener('input', (e) => applyToSelection('baseFontSize', parseInt(e.target.value), true, true));
    document.getElementById('objText').addEventListener('input', (e) => { const obj = canvas.getActiveObject(); if (!obj) return; if (obj.customType === 'text') { obj.set('text', e.target.value); autoFitText(obj); } else { obj.dataValue = e.target.value; updateCode(obj); } });
    document.getElementById('textAlignText').addEventListener('change', (e) => applyToSelection('textAlign', e.target.value));
    document.getElementById('maxLinesSelect').addEventListener('change', (e) => applyToSelection('maxLines', parseInt(e.target.value), true));
    document.getElementById('invertTextSelect').addEventListener('change', (e) => applyToSelection('inverted', e.target.value === 'true'));
    document.getElementById('showCodeText').addEventListener('change', (e) => applyToSelection('showText', e.target.value === 'true', false, true));
    document.getElementById('textOffset').addEventListener('input', (e) => applyToSelection('textOffset', e.target.value, false, true));
    document.getElementById('textAlignCode').addEventListener('change', (e) => applyToSelection('textPos', e.target.value, false, true));
    document.getElementById('dataType').addEventListener('change', (e) => { const obj = canvas.getActiveObject(); if (obj) { obj.isDynamic = (e.target.value === 'dynamic'); syncProps(); }});
    document.getElementById('fieldSelector').addEventListener('input', (e) => { const obj = canvas.getActiveObject(); if (obj) { obj.mappedField = e.target.value; }});

    const formatIfDate = (fieldName, value) => {
        if (!fieldName || !value) return String(value || "");
        if (fieldName.toLowerCase().includes('дата')) {
            const numVal = Number(value);
            if (!isNaN(numVal) && numVal > 10000) {
                const date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
                const day = String(date.getUTCDate()).padStart(2, '0');
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const year = date.getUTCFullYear();
                return `${day}.${month}.${year}`;
            }
        }
        return String(value);
    };

    const getPreviewData = (fieldName) => {
        if (!globalWorkbook || !document.getElementById('sheetSelector').value) return null;
        const rows = XLSX.utils.sheet_to_json(globalWorkbook.Sheets[document.getElementById('sheetSelector').value]);
        if (rows.length > 0 && rows[0][fieldName] !== undefined) {
            return formatIfDate(fieldName, rows[0][fieldName]);
        }
        return null;
    };

    document.getElementById('fieldSelector').addEventListener('input', (e) => { 
        const obj = canvas.getActiveObject(); if (!obj) return;
        if (obj.isDynamic) {
            const previewVal = getPreviewData(obj.mappedField);
            if (previewVal !== null) {
                document.getElementById('objText').value = previewVal;
                if (obj.customType === 'text') { obj.set('text', previewVal); autoFitText(obj); } else { obj.dataValue = previewVal; updateCode(obj); }
            }
        }
    });

    const getTplJSON = () => {
        return canvas.toJSON(['customType', 'dataValue', 'isDynamic', 'mappedField', 'baseFontSize', 'showText', 'textOffset', 'textPos', 'currentScaleLevel', 'barcodeHeight', 'boxWidth', 'customHeight', 'maxLines', 'inverted', 'textAlign', 'fontFamily', 'fontWeight', 'src']);
    };

    const applyTpl = (data, name) => {
        if (name) document.getElementById('tplName').value = name;
        document.getElementById('labelWidth').value = data.width;
        document.getElementById('labelHeight').value = data.height;
        updateCanvasSize();
        
        canvas.loadFromJSON(data.objects, () => {
            canvas.getObjects().forEach(obj => {
                attachScaleEvent(obj);
                if (obj.customType === 'text') autoFitText(obj); else if (obj.customType !== 'svg') updateCode(obj); 
            });
            canvas.renderAll();
        });
    };

    const loadLocalTpls = async () => {
        try {
            const tpls = await localforage.getItem('templates') || {};
            const sel = document.getElementById('tplSelector');
            sel.innerHTML = '';
            const defOpt = document.createElement('option');
            defOpt.value = ''; defOpt.text = '-- Выберите --';
            sel.appendChild(defOpt);
            
            Object.keys(tpls).forEach(k => { 
                const opt = document.createElement('option');
                opt.value = k; opt.text = k;
                sel.appendChild(opt); 
            });
            
            const lastTpl = await localforage.getItem('lastSelectedTpl');
            if (lastTpl && tpls[lastTpl]) {
                sel.value = lastTpl;
                applyTpl(tpls[lastTpl], lastTpl);
            }
        } catch (err) {
        }
    };
    loadLocalTpls();

    document.getElementById('saveLocalBtn').addEventListener('click', async () => {
        const name = document.getElementById('tplName').value.trim();
        if (!name) return showAlert("Введите имя шаблона!");
        
        const tpls = await localforage.getItem('templates') || {};
        tpls[name] = { width: document.getElementById('labelWidth').value, height: document.getElementById('labelHeight').value, objects: getTplJSON() };
        
        await localforage.setItem('templates', tpls); 
        await localforage.setItem('lastSelectedTpl', name);
        
        loadLocalTpls(); 
        showAlert("Шаблон сохранен в память устройства!");
    });

    document.getElementById('delLocalBtn').addEventListener('click', async () => {
        const name = document.getElementById('tplSelector').value;
        if (!name) return showAlert("Выберите шаблон для удаления!");
        
        if (confirm(`Удалить шаблон "${name}"?`)) {
            const tpls = await localforage.getItem('templates') || {};
            delete tpls[name];
            
            await localforage.setItem('templates', tpls); 
            await localforage.removeItem('lastSelectedTpl');
            
            document.getElementById('tplName').value = ''; 
            canvas.clear(); canvas.backgroundColor = '#ffffff'; canvas.renderAll();
            
            loadLocalTpls(); 
            showAlert("Шаблон удален!");
        }
    });

    document.getElementById('tplSelector').addEventListener('change', async (e) => { 
        await localforage.setItem('lastSelectedTpl', e.target.value); 
        loadLocalTpls(); 
    });

    document.getElementById('newLocalBtn').addEventListener('click', async () => { 
        document.getElementById('tplName').value = ''; 
        document.getElementById('tplSelector').value = ''; 
        await localforage.removeItem('lastSelectedTpl'); 
        canvas.clear(); canvas.backgroundColor = '#ffffff'; canvas.renderAll(); 
    });

    document.getElementById('exportTplBtn').addEventListener('click', () => { 
        const name = document.getElementById('tplName').value || 'Шаблон';
        const data = JSON.stringify({ 
            name: name, 
            width: document.getElementById('labelWidth').value, 
            height: document.getElementById('labelHeight').value, 
            objects: getTplJSON() 
        });
        const blob = new Blob([data], {type: "application/json"});
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; 
        a.download = `${name}.json`;
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    const fileImportInput = document.createElement('input');
    fileImportInput.type = 'file'; 
    fileImportInput.accept = '.json';
    fileImportInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            try {
                const data = JSON.parse(f.target.result);
                applyTpl(data, data.name || 'Импорт');
                showAlert("Шаблон успешно загружен!");
            } catch (err) {
                showAlert("Ошибка чтения файла шаблона!");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
    document.getElementById('importTplBtn').addEventListener('click', () => fileImportInput.click());

    document.getElementById('fetchSheetsBtn').addEventListener('click', async () => {
        const url = document.getElementById('sheetUrl').value;
        if (!url) return showAlert("Вставьте ссылку на таблицу!");
        localStorage.setItem('sheetUrl', url); 
        const match = url.match(/\/d\/(.+?)\//);
        if (!match) return showAlert("Неверный формат ссылки.");
        
        document.getElementById('fetchSheetsBtn').innerText = "Загрузка...";
        try {
            const targetUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
            const proxyUrl = `https://proxy.quack-label.space:8443/${targetUrl}`;
    
            const resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error(`Ошибка сервера прокси: ${resp.status}`);
            
            globalWorkbook = XLSX.read(await resp.arrayBuffer(), { type: 'array' });
            const selector = document.getElementById('sheetSelector');
            selector.innerHTML = globalWorkbook.SheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
            document.getElementById('sheetSelectionDiv').style.display = 'block';
            
        } catch (e) { 
            showAlert(`Не удалось скачать таблицу.\nЕсли доступ к Google Sheet точно открыт (Читатель), возможно, прокси-сервер перегружен.`); 
        } finally { 
            document.getElementById('fetchSheetsBtn').innerText = "Найти листы"; 
        }
    });

    document.getElementById('loadFieldsBtn').addEventListener('click', () => {
        const sheetName = document.getElementById('sheetSelector').value;
        const json = XLSX.utils.sheet_to_json(globalWorkbook.Sheets[sheetName], { header: 1 });
        if (json.length > 0) { 
            document.getElementById('dataFieldsList').innerText = "Поля:\n" + json[0].join(', '); 
            showAlert("Поля загружены!"); 
        }
    });

    document.getElementById('printBtn').addEventListener('click', async () => {
        const hasDynamic = canvas.getObjects().some(obj => obj.isDynamic);
        const url = document.getElementById('sheetUrl').value;
        const wMm = document.getElementById('labelWidth').value;
        const hMm = document.getElementById('labelHeight').value;

        const processPrint = async (rowsToPrint) => {
            canvas.discardActiveObject().renderAll();
            const svgs = [];
            
            for (let row of rowsToPrint) {
                const updatePromises = [];
                
                canvas.getObjects().forEach(obj => {
                    if (obj.isDynamic && obj.mappedField && row[obj.mappedField] !== undefined) {
                        const val = formatIfDate(obj.mappedField, row[obj.mappedField]);
                        if (obj.customType === 'text') { 
                            obj.set('text', val); 
                            obj.initDimensions(); 
                            autoFitText(obj); 
                        } else if (obj.customType !== 'svg') { 
                            obj.dataValue = val; 
                            updatePromises.push(new Promise(resolve => updateCode(obj, resolve))); 
                        }
                    }
                });
                
                if (updatePromises.length > 0) await Promise.all(updatePromises);
                canvas.renderAll();
                
                // let svg = canvas.toSVG();
                // svg = svg.replace(/^<svg [^>]*width="[^"]*"[^>]*height="[^"]*"/i, match => match.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"'));
                let svg = canvas.toSVG({ suppressPreamble: true });
                
                // Вписываем точные физические размеры этикетки
                svg = svg.replace(/^<svg [^>]*width="[^"]*"[^>]*height="[^"]*"/i, match => 
                    match.replace(/width="[^"]*"/, `width="${wMm}mm"`)
                         .replace(/height="[^"]*"/, `height="${hMm}mm"`)
                );
                
                // Вшиваем запрет на адаптивное растягивание и сглаживание во весь холст
                svg = svg.replace(/<svg /, '<svg preserveAspectRatio="none" shape-rendering="crispEdges" ');
                svgs.push(svg);
            }
            
            const iframe = document.createElement('iframe');
            iframe.style.position = 'absolute';
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html><head><title>Печать этикеток</title>
                <style>
                    @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
                    body { margin: 0; padding: 0; display: flex; flex-direction: column; background: white; }
                    svg * { shape-rendering: crispEdges !important; }
                    // svg { shape-rendering: crispEdges; }
                    // svg image { image-rendering: pixelated; }
                    .page { 
                        width: ${wMm}mm; 
                        height: ${hMm}mm; 
                        page-break-after: always; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        overflow: hidden; 
                    }
                    @media print {
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
                </head><body>
                ${svgs.map(s => `<div class="page">${s}</div>`).join('')}
                </body></html>
            `);
            doc.close();
            
            setTimeout(() => {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) document.body.removeChild(iframe);
                }, 2000);
            }, 500);
        };

        if (!hasDynamic) {
            return processPrint([{}]);
        }
        
        if (!url) return showAlert("Для пакетной печати загрузите таблицу слева!");

        const modal = document.getElementById('printModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('cancelPrintBtn').style.display = 'inline-block';
            
            if (!globalWorkbook) {
                document.getElementById('printModalControls').style.display = 'none'; 
                document.getElementById('confirmPrintBtn').style.display = 'none';
                try {
                    const match = url.match(/\/d\/(.+?)\//);
                    const resp = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`);
                    globalWorkbook = XLSX.read(await resp.arrayBuffer(), { type: 'array' });
                    const selHtml = globalWorkbook.SheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
                    document.getElementById('sheetSelector').innerHTML = selHtml;
                    document.getElementById('sheetSelectionDiv').style.display = 'block';
                } catch (e) { 
                    modal.style.display = 'none'; 
                    return showAlert("Ошибка скачивания таблицы."); 
                }
            }

            const sheetSel = document.getElementById('printSheetSelector');
            sheetSel.innerHTML = globalWorkbook.SheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
            if (document.getElementById('sheetSelector').value) sheetSel.value = document.getElementById('sheetSelector').value;
            
            document.getElementById('printModalStatus').innerText = "Успешно! Выберите лист для печати:";
            document.getElementById('printModalControls').style.display = 'block';
            document.getElementById('confirmPrintBtn').style.display = 'block';

            const oldConfirm = document.getElementById('confirmPrintBtn');
            const newConfirm = oldConfirm.cloneNode(true);
            oldConfirm.parentNode.replaceChild(newConfirm, oldConfirm);

            newConfirm.addEventListener('click', () => {
                document.getElementById('printModal').style.display = 'none';
                const rows = XLSX.utils.sheet_to_json(globalWorkbook.Sheets[sheetSel.value]);
                if (rows.length === 0) return showAlert("Выбранный лист пуст!");
                
                processPrint(rows);
            });
            
            document.getElementById('cancelPrintBtn').addEventListener('click', () => {
                document.getElementById('printModal').style.display = 'none';
            });
        } else {
            if (!globalWorkbook) return showAlert("Сначала загрузите таблицу!");
            const sheetName = document.getElementById('sheetSelector').value;
            const rows = XLSX.utils.sheet_to_json(globalWorkbook.Sheets[sheetName]);
            if (rows.length === 0) return showAlert("Выбранный лист пуст!");
            processPrint(rows);
        }
    });
});