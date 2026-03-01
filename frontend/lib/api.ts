import axios from "axios";

const api = axios.create({
    baseURL: "http://127.0.0.1:8000",
});

export async function getStats() {
    const res = await api.get("/api/stats");
    return res.data;
}

export async function getOrders(params?: {
    flagged_only?: boolean;
    category?: string;
    min_score?: number;
    search?: string;
    limit?: number;
}) {
    const res = await api.get("/api/orders", { params });
    return res.data;
}
export async function getOrder(orderId: string) {
    const res = await api.get(`/api/orders/${orderId}`);
    return res.data;
}

export async function getFraudSummary(orderId: string) {
    const res = await api.get(`/api/fraud-summary/${orderId}`);
    return res.data;
}

export async function updateOrderStatus(orderId: string, status: string) {
    const res = await api.patch(`/api/orders/${orderId}/status`, { status });
    return res.data;
}

export async function getTrends() {
    const res = await api.get("/api/trends");
    return res.data;
}

export async function getCategories() {
    const res = await api.get("/api/categories");
    return res.data;
}

export async function getCities() {
    const res = await api.get("/api/cities");
    return res.data;
}

export async function getVerification(orderId: string) {
    try {
        const res = await api.get(`/api/verifications/${orderId}`);
        return res.data;
    } catch {
        return null;
    }
}

export async function submitVerification(orderId: string, data: {
    agent_name: string;
    item_matches_order: boolean;
    tag_attached: boolean;
    packaging_intact: boolean;
    item_condition: string;
    agent_notes: string;
    photo_url: string;
}) {
    const res = await api.post(`/api/verify/${orderId}`, data);
    return res.data;
}

export async function getOrderForAgent(orderId: string) {
    const res = await api.get(`/api/verify/${orderId}`);
    return res.data;
}