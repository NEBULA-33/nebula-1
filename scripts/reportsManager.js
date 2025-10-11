import { state } from './dataManager.js';
import { renderReportTable, renderReportChart, clearReportDisplay } from './uiManager.js';
import { supabase } from './supabaseClient.js';
import { getCurrentRole } from './authManager.js';

let uiElements;
let activeReportGenerator = null; // Aktif rapor fonksiyonunu hafızada tutmak için

// Raporlar için gerekli olan tüm verileri tek seferde ve doğru şekilde çeken ana fonksiyon
async function fetchAllReportData() {
    const shopSelect = document.getElementById('report-shop-select');
    if (!shopSelect) return {};

    const selectedShopId = shopSelect.value;
    
    const tablesToFetch = [
        'sales', 'wastage_history', 'return_history', 
        'butchering_history', 'stock_in_history', 'audit_log'
    ];

    const queries = tablesToFetch.map(tableName => {
        let query = supabase.from(tableName).select('*');
        if (selectedShopId !== 'all') {
            query = query.eq('shop_id', selectedShopId);
        }
        return query;
    });

    const results = await Promise.all(queries);
    const reportData = {};

    results.forEach((result, index) => {
        const tableName = tablesToFetch[index];
        if (result.error) {
            console.error(`${tableName} verisi çekilirken hata:`, result.error);
            reportData[tableName] = [];
        } else {
            reportData[tableName] = result.data || [];
        }
    });

    // Ürünler, dükkan filtresine göre ayrı çekilir
    let productQuery = supabase.from('products').select('*');
    if (selectedShopId !== 'all') {
        productQuery = productQuery.eq('shop_id', selectedShopId);
    }
    const { data: productsData, error: productsError } = await productQuery;
    if (productsError) {
        console.error("Ürünler çekilirken hata:", productsError);
        reportData.products = [];
    } else {
        reportData.products = productsData || [];
    }

    return reportData;
}

// --- RAPOR OLUŞTURMA FONKSİYONLARI (İÇLERİ ŞİMDİLİK BOŞ) ---



// ... Diğer tüm rapor fonksiyonları için benzer boş şablonlar ...
async function generateGunSonu() {
    activeReportGenerator = generateGunSonu;
    const contentHTML = `<div class="form-group"><label for="gun-sonu-date">Rapor Tarihi Seçin:</label><input type="date" id="gun-sonu-date" value="${new Date().toISOString().split('T')[0]}"></div><div id="gun-sonu-summary"></div>`;
    renderReportTable('Gün Sonu Özeti', [], [], contentHTML);
    
    const dateInput = document.getElementById('gun-sonu-date');
    const summaryDiv = document.getElementById('gun-sonu-summary');
    
    // Veriyi Supabase'den dükkan filtresine uygun olarak çek
    const { sales } = await fetchAllReportData();

    const showSummary = (dateStr) => {
        if (!sales) {
            summaryDiv.innerHTML = '<p>Satış verisi bulunamadı.</p>';
            return;
        }
        const selectedDate = new Date(dateStr);
        const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

        const salesToday = sales.filter(s => {
            const saleDate = new Date(s.created_at); // Veritabanındaki created_at kullanılıyor
            return saleDate >= startOfDay && saleDate <= endOfDay;
        });

        const totalRevenue = salesToday.filter(s => s.quantity > 0).reduce((sum, s) => sum + (s.total_revenue || 0), 0);
        const totalProfit = salesToday.filter(s => s.quantity > 0).reduce((sum, s) => sum + ((s.total_revenue || 0) - (s.purchase_price || 0) * (s.quantity || 0)), 0);
        const totalReturns = salesToday.filter(s => s.quantity < 0).reduce((sum, s) => sum + Math.abs(s.total_revenue || 0), 0);

        summaryDiv.innerHTML = `
            <div class="summary-metrics">
                <div>Toplam Ciro: <span>${totalRevenue.toFixed(2)} TL</span></div>
                <div>Toplam Kâr: <span>${totalProfit.toFixed(2)} TL</span></div>
                <div>Toplam İade: <span>${totalReturns.toFixed(2)} TL</span></div>
            </div>`;
    };

    dateInput.addEventListener('change', (e) => showSummary(e.target.value));
    showSummary(dateInput.value); // Sayfa ilk yüklendiğinde bugünün özetini göster
}
async function generateFireReport() {
    activeReportGenerator = generateFireReport;
    
    // Veriyi Supabase'den dükkan filtresine uygun olarak çek
    const { wastage_history } = await fetchAllReportData();
    
    if (!wastage_history || wastage_history.length === 0) {
        return renderReportTable('Fire/Zayiat Raporu', [], [], '<p>Seçili filtre için zayiat kaydı bulunamadı.</p>');
    }
    
    const headers = ['Tarih', 'Ürün Adı', 'Miktar', 'Neden', 'Maliyet'];
    const rows = wastage_history
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)) // En yeniden eskiye sırala
        .map(log => [ 
            new Date(log.created_at).toLocaleString('tr-TR'), 
            log.product_name, 
            log.quantity, 
            log.reason, 
            `${(log.cost || 0).toFixed(2)} TL`
        ]);

    renderReportTable('Fire/Zayiat Raporu', headers, rows);
}

async function generateEnCokSatanReport() {
    activeReportGenerator = generateEnCokSatanReport;
    
    const { sales, products } = await fetchAllReportData();
    
    if (!sales || sales.length === 0) {
        return renderReportTable('En Çok Satan Ürünler (Ciroya Göre)', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const productSales = {};
    sales.forEach(sale => {
        if((sale.quantity || 0) > 0) { // Sadece satışları say, iadeleri hariç tut
            productSales[sale.product_id] = (productSales[sale.product_id] || 0) + (sale.total_revenue || 0);
        }
    });

    const sortedProducts = Object.entries(productSales)
        .sort(([,a],[,b]) => b - a) // Ciroya göre çoktan aza sırala
        .slice(0, 20); // İlk 20 ürünü al

    const headers = ['#', 'Ürün Adı', 'Toplam Ciro'];
    const rows = sortedProducts.map(([productId, totalRevenue], index) => {
        const product = products.find(p => p.id == productId);
        return [index + 1, product ? product.name : `Silinmiş Ürün (ID: ${productId})`, `${totalRevenue.toFixed(2)} TL`];
    });

    renderReportTable('En Çok Satan Ürünler (Ciroya Göre)', headers, rows);
}
async function generateKategoriPerformansRaporu() {
    activeReportGenerator = generateKategoriPerformansRaporu;
    
    const { sales, products } = await fetchAllReportData();

    if (!sales || sales.length === 0) {
        return renderReportTable('Kategori Performans Analizi', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const salesByCategory = {};
    sales.forEach(sale => {
        if((sale.quantity || 0) < 0) return; // İadeleri hariç tut

        const product = products.find(p => p.id === sale.product_id);
        const category = (product && product.category) ? product.category.trim() : 'Kategorisiz';
        
        salesByCategory[category] = (salesByCategory[category] || 0) + (sale.total_revenue || 0);
    });

    const chartConfig = {
        type: 'pie',
        data: {
            labels: Object.keys(salesByCategory),
            datasets: [{ 
                label: 'Ciro', 
                data: Object.values(salesByCategory),
                backgroundColor: ['#1877f2', '#36a2eb', '#ffce56', '#ff6384', '#4bc0c0', '#9966ff', '#ff9f40', '#e7e9ed'],
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false 
        }
    };
    renderReportChart('Kategori Bazında Ciro Dağılımı', '<div class="report-chart-container" style="max-height: 400px;"><canvas></canvas></div>', () => chartConfig);
}
async function generateIadeRaporu() {
    activeReportGenerator = generateIadeRaporu;
    
    const { return_history } = await fetchAllReportData();

    if (!return_history || return_history.length === 0) {
        return renderReportTable('İade Edilen Ürünler Raporu', [], [], '<p>Seçili filtre için iade kaydı bulunamadı.</p>');
    }

    const headers = ['Tarih', 'İade Edilen Ürün', 'Miktar', 'Değer', 'İade Nedeni'];
    const rows = return_history
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
        .map(r => [
            new Date(r.created_at).toLocaleString('tr-TR'), 
            r.product_name, 
            r.quantity, 
            `${(r.value || 0).toFixed(2)} TL`,
            r.reason || '-'
        ]);

    renderReportTable('İade Edilen Ürünler Raporu', headers, rows);
}
async function generateEnAzSatanReport() {
    activeReportGenerator = generateEnAzSatanReport;
    
    const { sales, products } = await fetchAllReportData();
    
    if (!products || products.length === 0) {
        return renderReportTable('En Az Satan Ürünler', [], [], '<p>Seçili filtre için ürün bulunamadı.</p>');
    }

    const productSalesCount = {};
    // Her ürünü başlangıçta 0 satışla listeye ekle
    products.forEach(p => productSalesCount[p.id] = 0);

    // Satışları say
    sales.forEach(sale => {
        if((sale.quantity || 0) > 0) {
            productSalesCount[sale.product_id] += (sale.quantity || 0);
        }
    });

    const sortedProducts = Object.entries(productSalesCount)
        .sort(([,a],[,b]) => a - b) // Satış miktarına göre azdan çoğa sırala
        .slice(0, 20); // En az satan ilk 20 ürünü al

    const headers = ['#', 'Ürün Adı', 'Satış Miktarı'];
    const rows = sortedProducts.map(([productId, count], index) => {
        const product = products.find(p => p.id == productId);
        return [index + 1, product ? product.name : `Silinmiş Ürün (ID: ${productId})`, product ? count.toFixed(product.is_weighable ? 3 : 0) : count];
    });

    renderReportTable('En Az Satan Ürünler', headers, rows);
}
async function generateSaatlikSatis() {
    activeReportGenerator = generateSaatlikSatis;
    
    const { sales } = await fetchAllReportData();

    if (!sales || sales.length === 0) {
        return renderReportTable('Saatlik Satış Yoğunluğu', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const salesByHour = Array(24).fill(0);
    sales.filter(s => s.quantity > 0).forEach(sale => {
        const hour = new Date(sale.created_at).getHours();
        salesByHour[hour] += (sale.total_revenue || 0);
    });

    const chartConfig = {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`),
            datasets: [{ 
                label: 'Toplam Ciro', 
                data: salesByHour, 
                backgroundColor: '#1877f2' 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false 
        }
    };
    renderReportChart('Saatlik Satış Yoğunluğu', '<div class="report-chart-container"><canvas></canvas></div>', () => chartConfig);
}
async function generateGunlukSatis() {
    activeReportGenerator = generateGunlukSatis;
    
    const { sales } = await fetchAllReportData();

    if (!sales || sales.length === 0) {
        return renderReportTable('Haftanın Gününe Göre Satışlar', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const salesByDay = Array(7).fill(0);
    sales.filter(s => s.quantity > 0).forEach(sale => {
        const dayIndex = new Date(sale.created_at).getDay();
        salesByDay[dayIndex] += (sale.total_revenue || 0);
    });

    const chartConfig = {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{ 
                label: 'Toplam Ciro', 
                data: salesByDay, 
                backgroundColor: '#28a745' 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false 
        }
    };
    renderReportChart('Haftanın Gününe Göre Satışlar', '<div class="report-chart-container"><canvas></canvas></div>', () => chartConfig);
}
async function generateCiroKarReport() {
    activeReportGenerator = generateCiroKarReport;
    
    const { sales } = await fetchAllReportData();

    if (!sales || sales.length === 0) {
        return renderReportTable('Dönemsel Ciro ve Kâr', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const filtersHTML = `<div class="report-filters" id="report-filters"><button class="filter-btn active" data-period="daily">Günlük</button><button class="filter-btn" data-period="weekly">Haftalık</button><button class="filter-btn" data-period="monthly">Aylık</button><button class="filter-btn" data-period="all">Tümü</button></div><div class="report-chart-container"><canvas></canvas></div>`;
    
    renderReportChart('Dönemsel Ciro ve Kâr Grafiği', filtersHTML, (period) => {
        const now = new Date();
        let startDate;
        switch(period) {
            case 'weekly': 
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); 
                break;
            case 'monthly': 
                startDate = new Date(now.getFullYear(), now.getMonth(), 1); 
                break;
            case 'all': 
                startDate = new Date(0); 
                break;
            case 'daily': 
            default: 
                startDate = new Date(new Date().setHours(0,0,0,0)); 
                break;
        }
        
        const salesInPeriod = sales.filter(s => new Date(s.created_at) >= startDate && s.quantity > 0);
        const salesByDay = {};

        salesInPeriod.forEach(sale => {
            const day = new Date(sale.created_at).toISOString().split('T')[0];
            if (!salesByDay[day]) {
                salesByDay[day] = { revenue: 0, profit: 0 };
            }
            const saleRevenue = sale.total_revenue || 0;
            const purchaseCost = (sale.purchase_price || 0) * (sale.quantity || 0);
            salesByDay[day].revenue += saleRevenue;
            salesByDay[day].profit += saleRevenue - purchaseCost;
        });

        const sortedLabels = Object.keys(salesByDay).sort((a,b) => new Date(a) - new Date(b));
        const chartData = {
            labels: sortedLabels,
            datasets: [
                { label: 'Ciro', data: sortedLabels.map(label => salesByDay[label].revenue), borderColor: '#1877f2', backgroundColor: 'rgba(24, 119, 242, 0.5)', tension: 0.1, yAxisID: 'y' },
                { label: 'Kâr', data: sortedLabels.map(label => salesByDay[label].profit), borderColor: '#28a745', backgroundColor: 'rgba(40, 167, 69, 0.5)', tension: 0.1, yAxisID: 'y' }
            ]
        };
        return { type: 'bar', data: chartData, options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: 'day' } }, y: { beginAtZero: true } } } };
    }, 'report-filters');
}
async function generateOrtalamaSepet() {
    activeReportGenerator = generateOrtalamaSepet;
    
    const { sales } = await fetchAllReportData();

    if (!sales || sales.length === 0) {
        return renderReportTable('Ortalama Sepet Tutarı', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const salesByTimestamp = {};
    sales.filter(s => s.quantity > 0).forEach(sale => {
        // Her bir satış işlemini 'sale_timestamp' ile gruplayarak fişleri sayıyoruz
        salesByTimestamp[sale.sale_timestamp] = (salesByTimestamp[sale.sale_timestamp] || 0) + (sale.total_revenue || 0);
    });

    const transactionCount = Object.keys(salesByTimestamp).length;
    const totalRevenue = sales.filter(s => s.quantity > 0).reduce((sum, s) => sum + (s.total_revenue || 0), 0);
    const averageBasket = transactionCount > 0 ? totalRevenue / transactionCount : 0;
    
    const content = `
        <div class="summary-metrics">
            <div>Ortalama Sepet Tutarı: <span>${averageBasket.toFixed(2)} TL</span></div>
            <div>Toplam Fiş Sayısı: <span>${transactionCount}</span></div>
            <div>Toplam Ciro: <span>${totalRevenue.toFixed(2)} TL</span></div>
        </div>`;

    renderReportTable('Ortalama Sepet Tutarı Analizi', [], [], content);
}
async function generateKanalSatisRaporu() {
    activeReportGenerator = generateKanalSatisRaporu;
    
    const { sales } = await fetchAllReportData();

    if (!sales || sales.length === 0) {
        return renderReportTable('Satış Kanalı Performansı', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const salesByChannel = {};
    sales.forEach(sale => {
        if (sale.quantity > 0) {
            const channel = sale.channel || 'Bilinmeyen';
            salesByChannel[channel] = (salesByChannel[channel] || 0) + (sale.total_revenue || 0);
        }
    });

    const chartConfig = {
        type: 'pie',
        data: {
            labels: Object.keys(salesByChannel),
            datasets: [{
                label: 'Ciro',
                data: Object.values(salesByChannel),
                backgroundColor: ['#1877f2', '#36a2eb', '#ffce56', '#ff6384', '#4bc0c0', '#9966ff', '#ff9f40'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    };
    renderReportChart('Satış Kanalı Performansı', '<div class="report-chart-container" style="max-height: 450px;"><canvas></canvas></div>', () => chartConfig);
}
async function generateParcalamaVerimRaporu() {
    activeReportGenerator = generateParcalamaVerimRaporu;
    
    const { butchering_history } = await fetchAllReportData();

    if (!butchering_history || butchering_history.length === 0) {
        return renderReportTable('Parçalama Verimlilik Raporu', [], [], '<p>Seçili filtre için parçalama kaydı bulunamadı.</p>');
    }

    const headers = ['Tarih', 'Reçete', 'Kaynak Ürün Maliyeti', 'Çıktıların Gelir Potansiyeli', 'Net Kâr Potansiyeli'];
    const rows = butchering_history
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
        .map(log => {
            const sourceCost = log.source_product_cost || 0;
            // 'outputs' sütunu jsonb formatında olduğu için içindeki veriyi kullanıyoruz
            const outputRevenue = (log.outputs || []).reduce((sum, output) => {
                return sum + ((output.quantity || 0) * (output.sellingPrice || 0));
            }, 0);
            const profit = outputRevenue - sourceCost;

            return [ 
                new Date(log.created_at).toLocaleString('tr-TR'), 
                log.recipe_name, 
                `${sourceCost.toFixed(2)} TL`, 
                `${outputRevenue.toFixed(2)} TL`, 
                `${profit.toFixed(2)} TL` 
            ];
        });

    renderReportTable('Parçalama Verimlilik Raporu', headers, rows);
}
async function generateIslemKayitlari() {
    activeReportGenerator = generateIslemKayitlari;
    
    const { audit_log } = await fetchAllReportData();

    if (!audit_log || audit_log.length === 0) {
        return renderReportTable('Tüm İşlem Kayıtları', [], [], '<p>Seçili filtre için işlem kaydı bulunamadı.</p>');
    }

    const headers = ['Tarih', 'İşlem Tipi', 'Detay'];
    const rows = audit_log
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
        .map(log => {
            let detailsText = '';
            const details = log.details || {};
            switch(log.action_type) {
                case 'PRODUCT_CREATE': detailsText = `Ürün oluşturuldu: ${details.productName}`; break;
                case 'PRODUCT_UPDATE': detailsText = `Ürün güncellendi: ${details.productName}`; break;
                case 'PRODUCT_DELETE': detailsText = `Ürün silindi: ${details.productName} (ID: ${details.productId})`; break;
                case 'PRODUCT_STOCK_ADD': detailsText = `${details.productName} ürününe stok eklendi: ${details.addedStock}`; break;
                case 'SALE_COMPLETED': detailsText = `${details.itemCount} kalem ürün satıldı. Toplam: ${(details.total || 0).toFixed(2)} TL`; break;
                case 'DEBT_SALE': detailsText = `${details.personName} adına veresiye satış: ${(details.amount || 0).toFixed(2)} TL`; break;
                case 'DEBT_TRANSACTION': detailsText = `${details.personName} için işlem: ${(details.amount || 0).toFixed(2)} TL (${details.description})`; break;
                case 'DEBT_PERSON_DELETE': detailsText = `Veresiye müşterisi silindi: ${details.personName}`; break;
                case 'WASTAGE': detailsText = `Fire/Zayiat: ${details.productName}, Miktar: ${details.quantity}, Neden: ${details.reason}`; break;
                case 'RETURN': detailsText = `İade alındı: ${details.productName}, Miktar: ${details.quantity}`; break;
                case 'STOCK_IN': detailsText = `${details.itemCount} kalem ürün için stok girişi yapıldı.`; break;
                case 'BUTCHERING': detailsText = `Parçalama: ${details.sourceProductName}, Miktar: ${details.quantity}`; break;
                case 'NOTE_CREATE': detailsText = `Yeni not oluşturuldu.`; break;
                case 'NOTE_DELETE': detailsText = `Not silindi (ID: ${details.noteId})`; break;
                default: detailsText = JSON.stringify(details);
            }
            return [
                new Date(log.created_at).toLocaleString('tr-TR'), 
                log.action_type, 
                detailsText
            ];
        });

    renderReportTable('Tüm İşlem Kayıtları', headers, rows);
}
async function generateStokDegeriRaporu() {
    activeReportGenerator = generateStokDegeriRaporu;
    
    const { products } = await fetchAllReportData();

    if (!products || products.length === 0) {
        return renderReportTable('Mevcut Stok Değeri', [], [], '<p>Seçili filtre için ürün bulunamadı.</p>');
    }

    const totalStockValue = products.reduce((sum, p) => {
        return sum + ((p.stock || 0) * (p.purchase_price || 0));
    }, 0);
    
    const content = `
        <div class="summary-metrics">
            <div>Mevcut Toplam Stok Değeri (Maliyet Üzerinden): <span>${totalStockValue.toFixed(2)} TL</span></div>
        </div>`;

    const headers = ['Ürün Adı', 'Mevcut Stok', 'Birim Maliyet', 'Toplam Değer'];
    const rows = products
        .filter(p => (p.stock || 0) > 0)
        .sort((a,b) => ((b.stock || 0) * (b.purchase_price || 0)) - ((a.stock || 0) * (a.purchase_price || 0)))
        .map(p => [
            p.name,
            `${(p.stock || 0).toFixed(p.is_weighable ? 3 : 0)} ${p.is_weighable ? 'kg' : 'adet'}`,
            `${(p.purchase_price || 0).toFixed(2)} TL`,
            `${((p.stock || 0) * (p.purchase_price || 0)).toFixed(2)} TL`
        ]);

    renderReportTable('Mevcut Stok Değeri', headers, rows, content);
}
async function generateActivityCalendar() {
    activeReportGenerator = generateActivityCalendar;
    
    const contentHTML = `<div id="calendar-container" style="height: 75vh;"></div>`;
    renderReportTable('İşletme Faaliyet Takvimi', [], [], contentHTML);

    const calendarEl = document.getElementById('calendar-container');
    if (!calendarEl) return;

    try {
        const selectedShopId = document.getElementById('report-shop-select').value;
        
        const queries = [
            supabase.from('sales').select('created_at, total_revenue').gt('quantity', 0),
            supabase.from('purchase_invoices').select('invoice_date, total_amount'),
            supabase.from('debt_transactions').select('created_at, amount').lt('amount', 0),
            supabase.from('wastage_history').select('created_at, cost')
        ];

        if (selectedShopId !== 'all') {
            for (let i = 0; i < queries.length; i++) {
                queries[i] = queries[i].eq('shop_id', selectedShopId);
            }
        }

        const results = await Promise.all(queries);
        const [salesResult, purchaseResult, debtResult, wastageResult] = results;
        
        if (salesResult.error) throw new Error(`Satış verileri çekilemedi: ${salesResult.error.message}`);
        if (purchaseResult.error) throw new Error(`Alım faturası verileri çekilemedi: ${purchaseResult.error.message}`);
        if (debtResult.error) throw new Error(`Veresiye işlem verileri çekilemedi: ${debtResult.error.message}`);
        if (wastageResult.error) throw new Error(`Fire geçmişi verileri çekilemedi: ${wastageResult.error.message}`);

        const salesData = salesResult.data;
        const purchaseData = purchaseResult.data;
        const debtData = debtResult.data;
        const wastageData = wastageResult.data;

        const dailyData = {};

        const processData = (data, dateField, valueField, targetKey) => {
            (data || []).forEach(item => {
                const day = item[dateField].split('T')[0];
                if (!dailyData[day]) dailyData[day] = { sales: 0, purchases: 0, collections: 0, wastage: 0 };
                dailyData[day][targetKey] += (targetKey === 'collections') ? Math.abs(item[valueField]) : item[valueField];
            });
        };
        
        processData(salesData, 'created_at', 'total_revenue', 'sales');
        processData(purchaseData, 'invoice_date', 'total_amount', 'purchases');
        processData(debtData, 'created_at', 'amount', 'collections');
        processData(wastageData, 'created_at', 'cost', 'wastage');
        
        const calendarEvents = Object.keys(dailyData).map(day => {
            const data = dailyData[day];
            const salesHtml = data.sales > 0 ? `<div class="fc-event-tag" style="background-color: #28a745;">✅ Ciro: ${data.sales.toFixed(0)} TL</div>` : '';
            const purchasesHtml = data.purchases > 0 ? `<div class="fc-event-tag" style="background-color: #dc3545;">🔴 Alım: ${data.purchases.toFixed(0)} TL</div>` : '';
            const collectionsHtml = data.collections > 0 ? `<div class="fc-event-tag" style="background-color: #007bff;">💰 Tahsilat: ${data.collections.toFixed(0)} TL</div>` : '';
            const wastageHtml = data.wastage > 0 ? `<div class="fc-event-tag" style="background-color: #ffc107; color: #333;">🗑️ Fire: ${data.wastage.toFixed(0)} TL</div>` : '';
            return {
                start: day,
                allDay: true,
                title: 'Gün Özeti', 
                eventContent: { html: `<div class="daily-summary">${salesHtml}${purchasesHtml}${collectionsHtml}${wastageHtml}</div>` },
                borderColor: 'transparent',
                backgroundColor: 'transparent'
            };
        });

        const calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'tr',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth' },
            initialView: 'dayGridMonth',
            events: calendarEvents,
            dayMaxEvents: true,
        });
        calendar.render();
    } catch (error) {
        calendarEl.innerHTML = `<p style="color: red; font-weight: bold; padding: 20px;">Takvim yüklenirken bir hata oluştu:<br><br>${error.message}</p>`;
    }
}

// --- ANA YÖNETİM FONKSİYONLARI (İSKELET) ---

function handleReportCardClick(e) {
    const card = e.target.closest('.report-card');
    if (!card) return;
    const reportId = card.dataset.reportId;
    if (!reportId) return;

    uiElements.reportHub.style.display = 'none';
    uiElements.reportDisplay.style.display = 'block';

    const reportFunctions = {
        'ciroKar': generateCiroKarReport,
        'kanalSatis': generateKanalSatisRaporu,
        'saatlikSatis': generateSaatlikSatis,
        'gunSonu': generateGunSonu,
        'islemKayitlari': generateIslemKayitlari,
        'stokDegeri': generateStokDegeriRaporu,
        'fireZayiat': generateFireReport,
        'enCokSatan': generateEnCokSatanReport,
       // 'enCokKar': generateEnCokKarReport,
        'enAzSatan': generateEnAzSatanReport,
        //'karMarji': generateKarMarjiRaporu,
        'kategoriPerformans': generateKategoriPerformansRaporu,
        'iadeRaporu': generateIadeRaporu,
        'saatlikSatis': generateSaatlikSatis,
        'gunlukSatis': generateGunlukSatis,
        'ciroKar': generateCiroKarReport,
        'ortalamaSepet': generateOrtalamaSepet,
        'kanalSatis': generateKanalSatisRaporu,
        'parcalamaVerim': generateParcalamaVerimRaporu,
        'activityCalendar': generateActivityCalendar,
        // Diğer tüm rapor id'leri buraya eklenecek
    };

    if (reportFunctions[reportId]) {
        reportFunctions[reportId]();
    } else {
        renderReportTable(`Rapor: ${reportId}`, [], [], '<p>Bu rapor henüz yapılandırılmamıştır.</p>');
        activeReportGenerator = () => renderReportTable(`Rapor: ${reportId}`, [], [], '<p>Bu rapor henüz yapılandırılmamıştır.</p>');
    }
}

function backToHub() {
    uiElements.reportDisplay.style.display = 'none';
    uiElements.reportHub.style.display = 'block';
    clearReportDisplay();
    activeReportGenerator = null;
}

async function populateShopSelect() {
    const shopSelect = document.getElementById('report-shop-select');
    const filtersContainer = document.getElementById('report-filters-container');
    if (!shopSelect || !filtersContainer) return;

    const role = getCurrentRole();
    if (role !== 'yönetici' && role !== 'manager') {
        filtersContainer.style.display = 'none';
        return;
    }
    filtersContainer.style.display = 'block';

    const { data: shops, error } = await supabase.from('shops').select('*');
    if (error) return console.error("Dükkanlar çekilemedi:", error);

    const currentShopOption = state.currentShop ? `<option value="${state.currentShop.id}">Sadece Bu Dükkan (${state.currentShop.name})</option>` : '';

    shopSelect.innerHTML = `
        ${currentShopOption}
        <option value="all">Tüm Dükkanlar (Genel Bakış)</option>
        ${(shops || []).filter(s => state.currentShop && s.id !== state.currentShop.id).map(shop => `<option value="${shop.id}">${shop.name}</option>`).join('')}
    `;
}

function onShopSelectionChange() {
    if (activeReportGenerator) {
        activeReportGenerator();
    }
}

export function initializeReportsManager(elements) {
    uiElements = elements;
    if(uiElements.reportHub) uiElements.reportHub.addEventListener('click', handleReportCardClick);
    if(uiElements.backToHubBtn) uiElements.backToHubBtn.addEventListener('click', backToHub);

    const shopSelect = document.getElementById('report-shop-select');
    if(shopSelect) {
        shopSelect.addEventListener('change', onShopSelectionChange);
    }

    const reportsTabButton = document.querySelector('button[data-tab="reports"]');
    if (reportsTabButton) {
        reportsTabButton.addEventListener('click', populateShopSelect);
    }
    
    if(document.querySelector('.tab-btn[data-tab="reports"].active')) {
        populateShopSelect();
    }
}