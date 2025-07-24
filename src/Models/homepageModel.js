import mongoose from "mongoose";
const { Schema } = mongoose;


const heroSectionSchema = new Schema({
    store_id: {
        type: Schema.Types.ObjectId,
        ref: 'Store',
        required: true
    },
    image_url: {
        type: String,
        required: true
    },
    nav_links: {
        type: String,
    }
}, {
    timestamps: true,
    versionKey: false
});
const trendingCategorySchema = new Schema({
    store_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    category_id: { type: Schema.Types.ObjectId, ref: 'StoreCategory', required: true },
    display_order: { type: Number, default: 0 }
}, { timestamps: true });

const trendingProductSchema = new Schema({
    store_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    trending_category_id: { type: Schema.Types.ObjectId, ref: 'TrendingCategory', required: true },
    display_order: { type: Number, default: 0 }
}, { timestamps: true });

const testimonialSchema = new Schema({
    store_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    name: { type: String, required: true },
    message: { type: String, required: true },
    photo_url: { type: String },
}, { timestamps: true });

const heroSlideSchema = new Schema({
    store_id: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    image_url: { type: String, required: true },
    title: { type: String },
    subtitle: { type: String },
    link: { type: String },
    display_order: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
}, { timestamps: true });

const TrendingCategory = mongoose.model('TrendingCategory', trendingCategorySchema);
const TrendingProduct = mongoose.model('TrendingProduct', trendingProductSchema);
const Testimonial = mongoose.model('Testimonial', testimonialSchema);
const HeroSlide = mongoose.model('HeroSlide', heroSlideSchema);

const HeroSection = mongoose.model('HeroSection', heroSectionSchema);


export { TrendingCategory, Testimonial, TrendingProduct, HeroSection, HeroSlide };
