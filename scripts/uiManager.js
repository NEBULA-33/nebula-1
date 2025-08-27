// scripts/uiManager.js

import { state } from './dataManager.js';
import { getCurrentStockInScans } from './stockManager.js';
import { getCreditSaleCart } from './debtManager.js';
import { getCurrentRole } from './authManager.js'; // Bu satır hataya neden oluyordu

let uiElements = {};
let chartInstance = null;

export function clearReportDisplay() {
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    if (uiElements.reportDisplayTitle) uiElements.reportDisplayTitle.innerHTML = '';
    if (uiElements.reportDisplayContent) uiElements.reportDisplayContent.innerHTML = '';
}

export function renderReportTable(title, headers, rows, customContent = '') {
    clearReportDisplay();
    uiElements.reportDisplayTitle.textContent = title;
    
    let tableHTML = '';
    if (headers.length > 0 || rows.length > 0) {
        tableHTML = '<table><thead><tr>';
        headers.forEach(header => tableHTML += `<th>${header}</th>`);
        tableHTML += '</tr></thead><tbody>';
        rows.forEach(row => {
            tableHTML += '<tr>';
            row.forEach(cell => tableHTML += `<td>${cell}</td>`);
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table>';
    }

    uiElements.reportDisplayContent.innerHTML = customContent + tableHTML;
}

export function renderReportChart(title, contentHTML, chartDataCallback, triggerId) {
    clearReportDisplay();
    uiElements.reportDisplayTitle.textContent = title;
    uiElements.reportDisplayContent.innerHTML = contentHTML;

    const canvas = uiElements.reportDisplayContent.querySelector('canvas');
    const triggerContainer = triggerId ? document.getElementById(triggerId) : uiElements.reportDisplayContent;

    const drawChart = (event) => {
        if (chartInstance) chartInstance.destroy();
        if (!canvas) return;
        
        let triggerValue = 'daily';
        if (triggerId && triggerContainer) {
             const activeFilter = triggerContainer.querySelector('.filter-btn.active');
             if(activeFilter) {
                triggerValue = activeFilter.dataset.period;
             } else if (triggerContainer.tagName === 'SELECT') {
                triggerValue = triggerContainer.value;
             } else if (triggerContainer.tagName === 'INPUT' && triggerContainer.type === 'date') {
                triggerValue = triggerContainer.value;
             }
        }
        
        const chartConfig = chartDataCallback(triggerValue);
        
        if (chartConfig) {
            canvas.style.display = 'block';
            chartInstance = new Chart(canvas.getContext('2d'), chartConfig);
        } else {
             if(canvas) canvas.style.display = 'none';
        }
    };
    
    if (triggerContainer) {
        if (triggerId === 'report-filters') {
             triggerContainer.addEventListener('click', (e) => {
                const target = e.target.closest('.filter-btn');
                if(target){
                    if(triggerContainer.querySelector('.active')) {
                        triggerContainer.querySelector('.active').classList.remove('active');
                    }
                    target.classList.add('active');
                    drawChart();
                }
             });
        } else {
            triggerContainer.addEventListener('change', drawChart);
        }
    }
    drawChart();
}

function renderProductList() {
    if (!uiElements.productListContainer) return;
    const role = getCurrentRole();
    const isManager = role === 'manager' || role === 'yönetici'; // İki rol adını da kontrol edelim
    let table = uiElements.productListContainer.querySelector('table');
    if (!table) {
        table = document.createElement('table');
        table.innerHTML = `<thead><tr><th>Ürün Adı</th><th>Kategori</th><th>Alış</th><th>Satış</th><th>Stok</th><th>İşlemler</th></tr></thead><tbody></tbody>`;
        uiElements.productListContainer.innerHTML = '';
        uiElements.productListContainer.appendChild(table);
    }
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    (state.products || []).forEach(product => {
        const row = tbody.insertRow();
        const stockUnit = product.is_weighable ? 'kg' : 'adet';
        // YENİ: "İşlemler" hücresine yönetici için bir "Sil" butonu eklendi.
        row.innerHTML = `<td>${product.name || 'İsimsiz Ürün'}</td><td>${product.category || '-'}</td><td>${(product.purchase_price || 0).toFixed(2)}</td><td>${(product.selling_price || 0).toFixed(2)}</td><td>${(product.stock || 0).toFixed(product.is_weighable ? 3 : 0)} ${stockUnit}</td><td class="actions"><button class="secondary-btn" onclick="window.app.editProduct(${product.id})">Düzenle</button>${isManager ? `<button class="delete-btn" onclick="window.app.deleteProduct(${product.id})">Sil</button>` : ''}</td>`;
    });
}

function renderCart() { 
    if (!uiElements.cartItemsContainer) return;
    uiElements.cartItemsContainer.innerHTML = '';
    let subtotal = 0;
    const vatRates = {};
    (state.currentCart || []).forEach(item => {
        const itemTotal = (item.quantity || 0) * (item.selling_price || 0);
        subtotal += itemTotal;
        const vatAmount = itemTotal - (itemTotal / (1 + (item.vat_rate || 0)));
        vatRates[item.vat_rate] = (vatRates[item.vat_rate] || 0) + vatAmount;
        const cartItemDiv = document.createElement('div');
        cartItemDiv.className = 'cart-item';
        cartItemDiv.innerHTML = `<span class="item-name">${item.name || ''}</span><span class="item-qty">${(item.quantity || 0).toFixed(item.is_weighable ? 3 : 2)}</span><span class="item-total">${itemTotal.toFixed(2)} TL</span><button class="delete-btn" onclick="window.app.removeFromCart(${item.cartId})">X</button>`;
        uiElements.cartItemsContainer.appendChild(cartItemDiv);
    });
    const totalVat = Object.values(vatRates).reduce((a, b) => a + b, 0);
    uiElements.subtotal.textContent = (subtotal - totalVat).toFixed(2) + ' TL';
    uiElements.vatBreakdown.innerHTML = Object.keys(vatRates).map(rate => `<div class="summary-row"><span>KDV (%${(rate * 100).toFixed(0)}):</span><span>${(vatRates[rate] || 0).toFixed(2)} TL</span></div>`).join('');
    uiElements.grandTotal.textContent = subtotal.toFixed(2) + ' TL';
    uiElements.completeSaleBtn.disabled = (state.currentCart || []).length === 0;
}

function renderQuickAddButtons() { 
    if (!uiElements.quickAddContainer) return;
    uiElements.quickAddContainer.innerHTML = '';
    const quickAddProducts = (state.products || []).filter(p => p.show_in_quick_add);
    if (quickAddProducts.length === 0) {
        uiElements.quickAddContainer.innerHTML = '<p style="font-size: 0.9em; color: #666;">Hızlı ekleme için ürünlerin detayından seçim yapın.</p>';
        return;
    }
    quickAddProducts.forEach(product => {
        const button = document.createElement('button');
        button.className = 'secondary-btn';
        button.textContent = product.name;
        button.title = `Stok: ${product.stock || 0}`;
        if (!product.stock || product.stock <= 0) button.disabled = true;
        button.addEventListener('click', () => { if (window.app && typeof window.app.addToCart === 'function') window.app.addToCart(product, 1); });
        uiElements.quickAddContainer.appendChild(button);
    });
}

function renderDebts() { 
    if (!uiElements.debtListContainer || !uiElements.debtSearchInput) return;
    const searchTerm = uiElements.debtSearchInput.value.toLowerCase();
    const filteredDebts = (state.debts || []).filter(p => p.person_name.toLowerCase().includes(searchTerm));
    if (filteredDebts.length === 0) {
        uiElements.debtListContainer.innerHTML = "<p>Kayıtlı kişi bulunamadı.</p>";
        return;
    }
    uiElements.debtListContainer.innerHTML = filteredDebts.map(person => {
        const totalBalance = (person.debt_transactions || []).reduce((acc, t) => acc + (t.amount || 0), 0);
        const balanceClass = totalBalance > 0 ? 'negative' : (totalBalance < 0 ? 'positive' : '');
        const balanceText = totalBalance > 0 ? `${totalBalance.toFixed(2)} TL Borçlu` : `${Math.abs(totalBalance).toFixed(2)} TL Alacaklı`;
        const phoneInfo = person.phone ? `<div class="person-contact"><strong>Tel:</strong> ${person.phone}</div>` : '';
        const addressInfo = person.address ? `<div class="person-contact"><strong>Adres:</strong> ${person.address.replace(/\n/g, '<br>')}</div>` : '';
        
        // YENİ: "card-actions" div'ine yönetici için bir "Kişiyi Sil" butonu eklendi.
        return `<div class="debt-person-card">
                    <div class="debt-person-header">
                        <span>${person.person_name}</span>
                        <span class="debt-balance ${balanceClass}">${totalBalance !== 0 ? balanceText : 'Hesap Kapalı'}</span>
                    </div>
                    ${phoneInfo}
                    ${addressInfo}
                    <div class="card-actions">
                        <button class="secondary-btn" onclick="app.addTransactionToPerson(${person.id})">İşlem Yap</button>
                        <button class="delete-btn manager-only" onclick="app.deletePerson(${person.id})">Kişiyi Sil</button>
                    </div>
                    <ul class="transaction-list">
                        ${(person.debt_transactions || []).slice(-5).reverse().map(t => `<li><span>${new Date(t.created_at).toLocaleDateString('tr-TR')} - ${t.description || ''}</span><span style="color: ${t.amount > 0 ? '#dc3545' : '#28a745'};">${(t.amount || 0).toFixed(2)} TL</span></li>`).join('')}
                    </ul>
                </div>`;
    }).join('');
}

function renderButchering() {
    if (!uiElements || !uiElements.recipeSourceProduct) return;
    const productsOptions = (state.products || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    uiElements.recipeSourceProduct.innerHTML = `<option value="">-- Kaynak Ürün Seç --</option>${productsOptions}`;
    uiElements.recipeListContainer.innerHTML = '<h4>Kayıtlı Reçeteler</h4><ul>' + (state.butcheringRecipes || []).map(r => `<li><span>${r.name} (Kaynak: ${state.products.find(p => p.id === r.source_product_id)?.name || 'Bilinmiyor'})</span><div class="actions"><button class="secondary-btn" onclick="window.app.editRecipe(${r.id})">Düzenle</button><button class="delete-btn" onclick="window.app.deleteRecipe(${r.id})">Sil</button></div></li>`).join('') + '</ul>';
}

function renderNotes() {
    if (!uiElements.noteListContainer) return;
    uiElements.noteListContainer.innerHTML = '';
    (state.personalNotes || []).forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.innerHTML = `<button class="delete-note-btn" title="Notu Sil" onclick="window.app.deleteNote(${note.id})">×</button><p>${note.content.replace(/\n/g, '<br>')}</p><div class="note-meta">${new Date(note.created_at).toLocaleString('tr-TR')}</div>`;
        uiElements.noteListContainer.appendChild(card);
    });
}

function renderStockSelects() {
    if (!uiElements.wastageProductSelect) return;
    const optionsHTML = (state.products || []).map(p => `<option value="${p.id}">${p.name} (Stok: ${(p.stock || 0).toFixed(p.is_weighable ? 3:0)})</option>`).join('');
    uiElements.wastageProductSelect.innerHTML = `<option value="">-- Ürün Seç --</option>${optionsHTML}`;
    uiElements.returnProductSelect.innerHTML = `<option value="">-- Ürün Seç --</option>${optionsHTML}`;
}

function renderWastageReasonsDropdowns() {
    if (!uiElements.wastageReasonSelect || !uiElements.returnReasonSelect) return;
    const reasons = state.wastageReasons || [];
    const optionsHTML = reasons.map(reason => `<option value="${reason}">${reason}</option>`).join('');
    const placeholder = '<option value="">-- Neden Seçin --</option>';
    uiElements.wastageReasonSelect.innerHTML = placeholder + optionsHTML;
    uiElements.returnReasonSelect.innerHTML = placeholder + optionsHTML;
}

function renderReasonManagementList() {
    if (!uiElements.reasonListContainer) return;
    const reasons = state.wastageReasons || [];
    if (reasons.length === 0) {
        uiElements.reasonListContainer.innerHTML = '<p>Kayıtlı neden bulunmuyor.</p>';
        return;
    }
    uiElements.reasonListContainer.innerHTML = '<ul>' + reasons.map((reason, index) => 
        `<li>${reason} <button class="delete-btn" onclick="window.app.deleteReason(${index})">Sil</button></li>`
    ).join('') + '</ul>';
}

function renderSalesChannelsDropdown() {
    if (!uiElements.salesChannelSelect) return;
    const channels = state.salesChannels || [];
    const optionsHTML = channels.map(channel => `<option value="${channel}">${channel}</option>`).join('');
    uiElements.salesChannelSelect.innerHTML = optionsHTML;
    if (channels.length > 0) {
        uiElements.salesChannelSelect.value = channels[0];
    }
}

function renderSalesChannelManagementList() {
    if (!uiElements.channelListContainer) return;
    const channels = state.salesChannels || [];
    if (channels.length === 0) {
        uiElements.channelListContainer.innerHTML = '<p>Kayıtlı kanal bulunmuyor.</p>';
        return;
    }
    uiElements.channelListContainer.innerHTML = '<ul>' + channels.map((channel, index) => 
        `<li>${channel} ${index > 0 ? `<button class="delete-btn" onclick="window.app.deleteChannel(${index})">Sil</button>` : '(Ana Kanal)'}</li>`
    ).join('') + '</ul>';
}

function renderStockInList() {
    if (!uiElements.stockInListContainer) return;
    const scans = getCurrentStockInScans();
    uiElements.confirmStockInBtn.disabled = scans.length === 0;
    if (scans.length === 0) {
        uiElements.stockInListContainer.innerHTML = ''; return;
    }
    const summary = scans.reduce((acc, scan) => {
        acc[scan.id] = acc[scan.id] || { name: scan.name, totalQuantity: 0, count: 0 };
        acc[scan.id].totalQuantity += scan.quantity;
        acc[scan.id].count++;
        return acc;
    }, {});
    let tableHTML = '<table><thead><tr><th>Ürün</th><th>Miktar</th></tr></thead><tbody>';
    for (const id in summary) {
        tableHTML += `<tr><td>${summary[id].name}</td><td>${summary[id].totalQuantity.toFixed(3)} (${summary[id].count} okutma)</td></tr>`;
    }
    tableHTML += '</tbody></table>';
    uiElements.stockInListContainer.innerHTML = tableHTML;
}

function renderAccessLog() {
    if (!uiElements.accessLogContainer) return;
    if (getCurrentRole() !== 'manager' || !state.accessLog || state.accessLog.length === 0) {
        uiElements.accessLogContainer.innerHTML = '<p>Görüntülenecek giriş kaydı yok.</p>'; return;
    }
    let logHTML = '<ul class="log-list">';
    (state.accessLog || []).forEach(log => {
        const logDate = new Date(log.timestamp);
        const statusClass = log.status === 'başarılı' ? 'log-success' : 'log-fail';
        logHTML += `<li class="${statusClass}"><strong>${(log.role || 'Bilinmeyen').toUpperCase()}</strong> - ${log.status.toUpperCase()}<span>${logDate.toLocaleString('tr-TR')}</span></li>`;
    });
    logHTML += '</ul>';
    uiElements.accessLogContainer.innerHTML = logHTML;
}

function renderAuditLog() {
    if (!uiElements.auditLogContainer) return;
    if (getCurrentRole() !== 'manager' || !state.auditLog || state.auditLog.length === 0) {
        uiElements.auditLogContainer.innerHTML = '<p>Görüntülenecek işlem kaydı yok.</p>'; return;
    }
    let logHTML = '<ul class="log-list">';
    (state.auditLog || []).forEach(log => {
        let detailsText = '';
        switch(log.type) {
            case 'PRODUCT_CREATE': detailsText = `Ürün oluşturuldu: <strong>${log.details.productName}</strong>`; break;
            case 'PRODUCT_UPDATE': detailsText = `Ürün güncellendi: <strong>${log.details.productName}</strong> (Değişen: ${log.details.changedFields.join(', ')})`; break;
            case 'WASTAGE': detailsText = `Fire: <strong>${log.details.productName}</strong>, Miktar: ${log.details.quantity}, Neden: ${log.details.reason}`; break;
            case 'STOCK_IN': detailsText = `Stok Girişi: <strong>${log.details.items.length}</strong> kalem ürün.`; break;
            case 'DEBT_SALE': detailsText = `Veresiye Satış: <strong>${log.details.personName}</strong>, Tutar: ${(log.details.amount || 0).toFixed(2)} TL`; break;
            case 'DEBT_TRANSACTION': detailsText = `Veresiye İşlem: <strong>${log.details.personName}</strong>, Tutar: ${(log.details.amount || 0).toFixed(2)} TL`; break;
            case 'DEBT_PERSON_DELETE': detailsText = `Veresiye Müşterisi Silindi: <strong>${log.details.personName}</strong>`; break;
            case 'BUTCHERING': detailsText = `Parçalama: <strong>${log.details.sourceProductName}</strong>, Miktar: ${log.details.quantity}`; break;
            case 'NOTE_CREATE': detailsText = `Not oluşturuldu (ID: ${log.details.noteId})`; break;
            case 'NOTE_DELETE': detailsText = `Not silindi (ID: ${log.details.noteId})`; break;
            default: detailsText = JSON.stringify(log.details);
        }
        logHTML += `<li><span style="font-size:0.8em; color:#666">${new Date(log.timestamp).toLocaleString('tr-TR')}</span><br>${detailsText}</li>`;
    });
    logHTML += '</ul>';
    uiElements.auditLogContainer.innerHTML = logHTML;
}

function renderDebtSale() {
    if (!uiElements.debtSaleContainer || uiElements.debtSaleContainer.style.display === 'none') return;
    const currentSelection = uiElements.debtSalePersonSelect.value;
    const optionsHTML = (state.debts || []).map(p => `<option value="${p.id}">${p.person_name}</option>`).join('');
    uiElements.debtSalePersonSelect.innerHTML = `<option value="">-- Müşteri Seçin --</option>${optionsHTML}`;
    if(currentSelection) uiElements.debtSalePersonSelect.value = currentSelection;
    const cart = getCreditSaleCart();
    if (cart.length === 0) {
        uiElements.debtSaleCartContainer.innerHTML = '<p>Sepet boş.</p>';
    } else {
        uiElements.debtSaleCartContainer.innerHTML = cart.map(item => `<div class="cart-item"><span class="item-name">${item.name || ''}</span><span class="item-qty">${(item.quantity || 0).toFixed(item.is_weighable ? 3 : 0)} ${item.is_weighable ? 'kg' : 'adet'}</span><span class="item-total">${((item.quantity || 0) * (item.selling_price || 0)).toFixed(2)} TL</span></div>`).join('');
    }
    const total = cart.reduce((sum, item) => sum + ((item.quantity || 0) * (item.selling_price || 0)), 0);
    uiElements.debtSaleTotal.textContent = total.toFixed(2) + ' TL';
    uiElements.debtSaleConfirmBtn.disabled = cart.length === 0 || !uiElements.debtSalePersonSelect.value;
}

export function renderAll() {
    try {
        if (!document.querySelector('.main-container') || document.querySelector('.main-container').style.display === 'none') return;
        renderProductList();
        renderCart();
        renderQuickAddButtons();
        renderDebts();
        renderStockSelects();
        renderWastageReasonsDropdowns();
        renderReasonManagementList();
        renderSalesChannelsDropdown();
        renderSalesChannelManagementList();
        renderStockInList();
        renderButchering();
        renderNotes();
        renderAccessLog();
        renderDebtSale();
        renderAuditLog();
    } catch (error) {
        console.error("Arayüz çizimi sırasında bir hata oluştu:", error);
    }
}

export function initializeUIManager(elements) {
    uiElements = elements;
}