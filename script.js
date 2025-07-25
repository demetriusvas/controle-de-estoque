
// PASTE YOUR FIREBASE CONFIGURATION HERE
const firebaseConfig = {
  apiKey: "AIzaSyAR8ob5USJ7Zcw8Z2Wy2w1mv3v_d_U7GM0",
  authDomain: "controle-de-estoque-476d7.firebaseapp.com",
  projectId: "controle-de-estoque-476d7",
  storageBucket: "controle-de-estoque-476d7.firebasestorage.app",
  messagingSenderId: "1062771693953",
  appId: "1:1062771693953:web:7509ff6ae20fe716203080",
  measurementId: "G-8L5MLBCFMX"
};

// Initialize Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, query, where, getDocs, runTransaction, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class InventoryManager {
    constructor(db) {
        this.db = db;
        this.items = [];
        this.movements = [];
        this.editingId = null;
        this.currentHistoryItem = null;
        this.unsubscribeItems = null;
        this.unsubscribeMovements = null;

        this.initEventListeners();
        this.listenForData();
    }

    listenForData() {
        if (this.unsubscribeItems) this.unsubscribeItems();
        this.unsubscribeItems = onSnapshot(query(collection(db, "items"), orderBy("createdAt", "desc")),
            snapshot => {
                this.items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.renderAll();
            });

        if (this.unsubscribeMovements) this.unsubscribeMovements();
        this.unsubscribeMovements = onSnapshot(query(collection(db, "movements"), orderBy("date", "desc")),
            snapshot => {
                this.movements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.renderMovementHistory();
            });
    }

    renderAll() {
        this.renderDashboard();
        this.renderTable();
        this.updateCategoryFilter();
        this.updateCategoryDatalist();
    }

    initEventListeners() {
        // Modal controls
        document.getElementById('addItemBtn').addEventListener('click', () => this.openModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('itemForm').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('closeHistoryBtn').addEventListener('click', () => this.closeHistoryModal());
        
        // Search and filter
        document.getElementById('searchInput').addEventListener('input', () => this.renderAll());
        document.getElementById('categoryFilter').addEventListener('change', () => this.renderAll());
        
        // Import/Export (Temporarily Disabled)
        // document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        // document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileInput').click());
        // document.getElementById('fileInput').addEventListener('change', (e) => this.importData(e));
        
        // Movement controls
        document.getElementById('addMovementBtn').addEventListener('click', () => this.addMovement());
        
        // Close modals on background click
        document.getElementById('itemModal').addEventListener('click', (e) => {
            if (e.target.id === 'itemModal') this.closeModal();
        });
        document.getElementById('historyModal').addEventListener('click', (e) => {
            if (e.target.id === 'historyModal') this.closeHistoryModal();
        });
    }

    updateCategoryDatalist() {
        const datalist = document.getElementById('categoryDatalist');
        const categories = [...new Set(this.items.map(item => item.category))].sort();
        datalist.innerHTML = categories.map(category => `<option value="${category}"></option>`).join('');
    }

    openModal(item = null) {
        this.editingId = item ? item.id : null;
        const modal = document.getElementById('itemModal');
        const title = document.getElementById('modalTitle');
        
        title.textContent = item ? 'Editar Item' : 'Adicionar Item';
        
        if (item) {
            document.getElementById('itemName').value = item.name;
            document.getElementById('itemCategory').value = item.category;
            document.getElementById('itemQuantity').value = item.quantity;
            document.getElementById('itemLocation').value = item.location;
            document.getElementById('itemNotes').value = item.notes || '';
        } else {
            document.getElementById('itemForm').reset();
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('itemName').focus();
    }

    closeModal() {
        const modal = document.getElementById('itemModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        this.editingId = null;
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('itemName').value.trim(),
            category: document.getElementById('itemCategory').value.trim(),
            quantity: parseInt(document.getElementById('itemQuantity').value),
            location: document.getElementById('itemLocation').value.trim(),
            notes: document.getElementById('itemNotes').value.trim()
        };

        try {
            if (this.editingId) {
                const itemRef = doc(db, 'items', this.editingId);
                const oldDoc = await getDoc(itemRef);

                await updateDoc(itemRef, formData);

                if (oldDoc.data().quantity !== formData.quantity) {
                    const diff = formData.quantity - oldDoc.data().quantity;
                    await addDoc(collection(db, 'movements'), {
                        itemId: this.editingId,
                        type: diff > 0 ? 'entrada' : 'saida',
                        quantity: Math.abs(diff),
                        date: new Date(),
                        note: 'Ajuste manual via edição'
                    });
                }
            } else {
                const newItemRef = await addDoc(collection(db, 'items'), {
                    ...formData,
                    createdAt: new Date()
                });
                
                if (formData.quantity > 0) {
                    await addDoc(collection(db, 'movements'), {
                        itemId: newItemRef.id,
                        type: 'entrada',
                        quantity: formData.quantity,
                        date: new Date(),
                        note: 'Estoque inicial'
                    });
                }
            }
            this.closeModal();
        } catch (error) {
            console.error("Erro ao salvar item: ", error);
            alert("Ocorreu um erro ao salvar o item.");
        }
    }

    async deleteItem(id) {
        if (confirm('Tem certeza que deseja excluir este item? Todos os movimentos associados também serão excluídos.')) {
            try {
                const itemRef = doc(db, 'items', id);
                await deleteDoc(itemRef);

                const movementsQuery = query(collection(db, 'movements'), where('itemId', '==', id));
                const movementsSnapshot = await getDocs(movementsQuery);
                
                const batch = writeBatch(db);
                movementsSnapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();

            } catch (error) {
                console.error("Erro ao excluir item: ", error);
                alert("Ocorreu um erro ao excluir o item.");
            }
        }
    }

    openHistoryModal(item) {
        this.currentHistoryItem = item;
        const modal = document.getElementById('historyModal');
        const title = document.getElementById('historyTitle');
        
        title.textContent = `Histórico - ${item.name}`;
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        this.renderMovementHistory();
    }

    closeHistoryModal() {
        const modal = document.getElementById('historyModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        this.currentHistoryItem = null;
    }

    async addMovement() {
        if (!this.currentHistoryItem) return;
        
        const type = document.getElementById('movementType').value;
        const quantity = parseInt(document.getElementById('movementQuantity').value);
        const note = document.getElementById('movementNote').value.trim();
        
        if (!quantity || quantity <= 0) {
            alert('Por favor, insira uma quantidade válida.');
            return;
        }

        const itemRef = doc(db, 'items', this.currentHistoryItem.id);

        try {
            await runTransaction(db, async (transaction) => {
                const itemDoc = await transaction.get(itemRef);
                if (!itemDoc.exists) {
                    throw "Documento não existe!";
                }

                const newQuantity = itemDoc.data().quantity + (type === 'entrada' ? quantity : -quantity);
                if (newQuantity < 0) {
                    throw "Quantidade insuficiente em estoque.";
                }

                transaction.update(itemRef, { quantity: newQuantity });
                
                const movementRef = doc(collection(db, 'movements'));
                transaction.set(movementRef, {
                    itemId: this.currentHistoryItem.id,
                    type: type,
                    quantity: quantity,
                    date: new Date(),
                    note: note || ''
                });
            });

            document.getElementById('movementQuantity').value = '';
            document.getElementById('movementNote').value = '';

        } catch (error) {
            console.error("Erro ao adicionar movimento: ", error);
            alert(`Erro: ${error}`);
        }
    }

    renderMovementHistory() {
        if (!this.currentHistoryItem) return;
        
        const historyContainer = document.getElementById('movementHistory');
        const itemMovements = this.movements
            .filter(movement => movement.itemId === this.currentHistoryItem.id);

        if (itemMovements.length === 0) {
            historyContainer.innerHTML = '<p class="text-gray-400 text-sm">Nenhuma movimentação registrada.</p>';
            return;
        }

        historyContainer.innerHTML = itemMovements.map(movement => {
            const date = dayjs(movement.date.toDate()).fromNow();
            const typeColor = movement.type === 'entrada' ? 'text-green-400' : 'text-red-400';
            const typeSymbol = movement.type === 'entrada' ? '+' : '-';
            
            return `
                <div class="bg-gray-700 rounded-lg p-3">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-sm text-gray-300">${date}</span>
                        <span class="${typeColor} font-medium">${typeSymbol}${movement.quantity}</span>
                    </div>
                    <div class="text-xs text-gray-400 capitalize">${movement.type}</div>
                    ${movement.note ? `<div class="text-xs text-gray-400 mt-1">${movement.note}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    renderDashboard() {
        const dashboard = document.getElementById('dashboard');
        const lowStockItems = this.items.filter(item => item.quantity > 0 && item.quantity < 5);
        const outOfStockItems = this.items.filter(item => item.quantity === 0);

        let dashboardHTML = '';

        if (lowStockItems.length > 0) {
            dashboardHTML += `
                <div class="bg-yellow-900/50 border border-yellow-700 rounded-xl p-4 mb-4">
                    <h3 class="font-semibold text-yellow-300">Estoque Baixo</h3>
                    <p class="text-yellow-400 text-sm mt-1">
                        ${lowStockItems.length} item(ns) precisam de atenção.
                    </p>
                    <ul class="mt-2 text-sm text-yellow-400/80 list-disc list-inside">
                        ${lowStockItems.map(item => `<li><a href="#" onclick='inventoryManager.openModal(${JSON.stringify(item)})' class="hover:underline">${item.name} (Qtd: ${item.quantity})</a></li>`).join('')}
                    </ul>
                </div>
            `;
        }

        if (outOfStockItems.length > 0) {
            dashboardHTML += `
                <div class="bg-red-900/50 border border-red-700 rounded-xl p-4">
                    <h3 class="font-semibold text-red-400">Estoque Zerado</h3>
                    <p class="text-red-500 text-sm mt-1">
                        ${outOfStockItems.length} item(ns) estão fora de estoque.
                    </p>
                    <ul class="mt-2 text-sm text-red-400/80 list-disc list-inside">
                        ${outOfStockItems.map(item => `<li><a href="#" onclick='inventoryManager.openModal(${JSON.stringify(item)})' class="hover:underline">${item.name}</a></li>`).join('')}
                    </ul>
                </div>
            `;
        }

        dashboard.innerHTML = dashboardHTML;
    }

    getFilteredItems() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;
        
        return this.items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm);
            const matchesCategory = !categoryFilter || item.category === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }

    renderTable() {
        const tbody = document.getElementById('inventoryTable');
        const filteredItems = this.getFilteredItems();
        
        document.getElementById('totalItems').textContent = filteredItems.length;

        if (filteredItems.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-gray-400">
                        Nenhum item encontrado. Tente adicionar um novo item!
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filteredItems.map(item => {
            const quantityColor = item.quantity === 0 ? 'text-red-400' : item.quantity < 5 ? 'text-yellow-400' : 'text-green-400';
            
            return `
                <tr class="hover:bg-gray-700 transition-colors">
                    <td class="px-6 py-4 font-medium">${item.name}</td>
                    <td class="px-6 py-4 text-gray-300">${item.category}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="${quantityColor} font-medium">${item.quantity}</span>
                    </td>
                    <td class="px-6 py-4 text-gray-300">${item.location}</td>
                    <td class="px-6 py-4 text-gray-300 max-w-xs truncate" title="${item.notes || ''}">${item.notes || '-'}</td>
                    <td class="px-6 py-4 text-center">
                        <div class="flex justify-center space-x-2">
                            <button onclick='inventoryManager.openHistoryModal(${JSON.stringify(item)})' 
                                    class="text-blue-400 hover:text-blue-300 transition-colors" title="Ver histórico">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </button>
                            <button onclick='inventoryManager.openModal(${JSON.stringify(item)})' 
                                    class="text-yellow-400 hover:text-yellow-300 transition-colors" title="Editar">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                            <button onclick="inventoryManager.deleteItem('${item.id}')" 
                                    class="text-red-400 hover:text-red-300 transition-colors" title="Excluir">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateCategoryFilter() {
        const select = document.getElementById('categoryFilter');
        const currentValue = select.value;
        const categories = [...new Set(this.items.map(item => item.category))].sort();
        
        select.innerHTML = '<option value="">Todas as categorias</option>' +
            categories.map(category => `<option value="${category}">${category}</option>`).join('');
        
        if (categories.includes(currentValue)) {
            select.value = currentValue;
        }
    }
}

// Initialize the application
const inventoryManager = new InventoryManager(db);
