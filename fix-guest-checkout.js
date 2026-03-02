import mongoose from 'mongoose';

const MONGO_URL = "mongodb://root:occubit2905@72.60.99.108:27017/dhaneri?authSource=admin";
const STORE_ID = "68bd6b50df60e95ab4f5aceb";

const storeSchema = new mongoose.Schema({}, { strict: false });

async function run() {
    try {
        await mongoose.connect(MONGO_URL);
        console.log("Connected to MongoDB.");

        const Store = mongoose.model('Store', storeSchema);

        const store = await Store.findById(STORE_ID);
        if (!store) {
            console.log("Store not found!");
            process.exit(1);
        }

        console.log("Current config before update:", store.config);

        await Store.updateOne(
            { _id: STORE_ID },
            { $set: { "config.allow_guest_checkout": true } }
        );

        const updated = await Store.findById(STORE_ID).select('config');
        console.log("Updated config:", updated.config);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

run();
