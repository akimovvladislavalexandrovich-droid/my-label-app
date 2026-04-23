const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // 3) Отключаем системное меню (File, Edit, View, Window)
  mainWindow.setMenu(null); 
  
  mainWindow.loadFile('index.html');
}

// Печать в PDF (Чистый вектор)
ipcMain.on('print-to-pdf', async (event, { svgs, widthMm, heightMm }) => {
    let tempHtmlPath = null;
    try {
        const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
            title: 'Сохранить этикетки (PDF)',
            defaultPath: `Labels_${Date.now()}.pdf`,
            filters: [{ name: 'PDF Документ', extensions: ['pdf'] }]
        });
        
        if (canceled || !filePath) return; 

        // 2) Сообщаем интерфейсу, что началось формирование и сохранение файла
        event.sender.send('show-saving-modal');

        const workerWin = new BrowserWindow({ show: false });
        
        const htmlPages = svgs.map(svg => `
            <div style="page-break-after: always; width: ${widthMm}mm; height: ${heightMm}mm; margin: 0; padding: 0; overflow: hidden; display: flex; justify-content: center; align-items: center;">
                ${svg}
            </div>
        `).join('');
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
                    body { margin: 0; padding: 0; background: white; }
                </style>
            </head>
            <body>${htmlPages}</body>
            </html>
        `;

        tempHtmlPath = path.join(app.getPath('temp'), `print_label_${Date.now()}.html`);
        fs.writeFileSync(tempHtmlPath, html, 'utf-8');

        await workerWin.loadFile(tempHtmlPath);

        const pdfData = await workerWin.webContents.printToPDF({ 
            preferCSSPageSize: true, printBackground: true, marginsType: 1 
        });

        fs.writeFileSync(filePath, pdfData);
        workerWin.destroy();
        if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);

        // Убираем окно загрузки после успешного сохранения
        event.sender.send('hide-saving-modal');

        shell.openPath(filePath);
    } catch (error) { 
        // Убираем окно загрузки, если произошла ошибка
        event.sender.send('hide-saving-modal');
        dialog.showErrorBox("Ошибка печати", error.message);
        if (tempHtmlPath && fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
    }
});

ipcMain.handle('show-alert', async (event, message) => {
    await dialog.showMessageBox(mainWindow, { type: 'info', message: message, title: 'Информация' });
});
ipcMain.handle('save-template-dialog', async (event, defaultName) => {
    return await dialog.showSaveDialog(mainWindow, { title: 'Экспорт', defaultPath: `${defaultName || 'Шаблон'}.json`, filters: [{ name: 'Шаблон', extensions: ['json'] }] });
});
ipcMain.handle('load-template-dialog', async () => {
    return await dialog.showOpenDialog(mainWindow, { title: 'Импорт', filters: [{ name: 'Шаблон', extensions: ['json'] }], properties: ['openFile'] });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });