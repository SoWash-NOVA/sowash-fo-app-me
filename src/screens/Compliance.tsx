import * as Speech from "expo-speech";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// ==========================================
// COMPLIANCE DATA (URDU)
// ==========================================
const complianceData = [
  {
    id: 1,
    title: "1. ذاتی حفاظتی سامان (PPE)",
    points: [
      "گیلی سطح پر پھسلنے سے بچنے کے لیے نان سلِپ جوتے پہنیں۔",
      "گرفت بہتر بنانے اور تیز کناروں یا کیمیکلز سے بچاؤ کے لیے دستانے استعمال کریں۔",
      "پانی کے چھینٹوں یا صفائی کے کیمیکلز سے آنکھوں کے تحفظ کے لیے حفاظتی چشمہ پہنیں۔",
      "علی الصبح اور شام کے وقت صفائی کے دوران بہتر نمایاں ہونے کے لیے ہائی وِزِبلٹی واسکٹ پہنیں۔",
    ],
  },
  {
    id: 2,
    title: "2. برقی خطرات",
    points: [
      "وائرنگ یا جنکشن باکس جیسے برقی حصّوں سے براہِ راست رابطے سے گریز کریں۔",
      "بجلی کے جھٹکے کے خطرے کو کم کرنے کے لیے نان کنڈکٹیو اوزار استعمال کریں۔",
      "صفائی سے قبل سائٹ کا بصری معائنہ کریں تاکہ کیبلز درست اور بغیر نقصان کے ہوں۔",
    ],
  },
  {
    id: 3,
    title: "3. بلندی پر کام",
    points: [
      "چھت پر نصب پینلز کی صفائی کے دوران فال پروٹیکشن آلات جیسے سیفٹی ہارنس استعمال کریں۔",
      "پھسلنے کے خطرات کم کرنے کے لیے گیلی یا تیز ہوا والی صورتحال میں کام سے گریز کریں۔",
    ],
  },
  {
    id: 4,
    title: "4. پانی کا استعمال",
    points: [
      "سولر پینلز کو نقصان سے بچانے کے لیے کم دباؤ والا پانی استعمال کریں۔",
      "گرم پینلز پر پانی استعمال نہ کریں کیونکہ اچانک درجۂ حرارت کی تبدیلی سے دراڑیں پڑ سکتی ہیں؛ صفائی علی الصبح یا شام میں کریں۔",
      "پانی کے بہاؤ سے اردگرد کی جگہ پھسلن والی ہو سکتی ہے، احتیاط کریں۔",
    ],
  },
  {
    id: 5,
    title: "5. موسمی حالات",
    points: [
      "بارش، آندھی/طوفان یا تیز ہوا کے دوران پینلز کی صفائی نہ کریں کیونکہ اس سے پھسلنے یا برقی خطرات بڑھ جاتے ہیں۔",
      "درجۂ حرارت پر نظر رکھیں—انتہائی گرمی پینلز کے ٹوٹنے کا سبب بن سکتی ہے۔",
    ],
  },
  {
    id: 6,
    title: "6. پانی پینا اور وقفے",
    points: [
      "خاص طور پر گرم حالات میں کام کے دوران بار بار وقفہ کریں، پانی پئیں اور تھکن سے بچیں۔",
    ],
  },
  {
    id: 7,
    title: "7. صفائی و نظم (Housekeeping)",
    points: [
      "پھسلنے اور ٹھوکر کے واقعات سے بچنے کے لیے سائٹ کو صاف ستھرا رکھیں اور باقاعدہ ہاؤس کیپنگ یقینی بنائیں۔",
    ],
  },
  {
    id: 8,
    title: "8. سخت ممانعت — سولر پینلز پر چلنا",
    points: [
      "کسی بھی صورت میں سولر پینلز پر چلنا، کھڑا ہونا، بیٹھنا یا وزن ڈالنا سختی سے منع ہے۔",
      "صرف مقررہ واک ویز اور منظور شدہ راستے استعمال کیے جائیں۔",
      "خلاف ورزی کی صورت میں فوری طور پر سائٹ سے ہٹایا جائے گا اور تادیبی کارروائی ہوگی۔",
    ],
    isWarning: true,
  },
  {
    id: 9,
    title: "9. اجازت اور نگرانی",
    points: [
      "صرف تربیت یافتہ اور مجاز عملہ ہی پینلز کی صفائی کر سکے گا۔",
      "صفائی کے دوران ہر وقت سائٹ سپروائزر کی موجودگی لازم ہے۔",
      "سپروائزر کی منظوری اور سائٹ بریفنگ کے بغیر کوئی سرگرمی شروع نہیں کی جائے گی۔",
    ],
  },
  {
    id: 10,
    title: "10. یونیفارم اور سائٹ انٹری کنٹرول",
    points: [
      "مکمل کمپنی یونیفارم کے بغیر سائٹ میں داخلہ سختی سے منع ہے۔",
      "کام شروع کرنے سے قبل تعمیل کی تصدیق سپروائزر کی ذمہ داری ہے۔",
    ],
  },
  {
    id: 11,
    title: "11. اوزار، ہوز اور آلات کا کنٹرول",
    points: [
      "استعمال سے پہلے تمام ہوز، پولز، نوزلز اور اوزاروں کا معائنہ کیا جائے۔",
      "خراب یا رِسنے والے آلات استعمال نہ کیے جائیں۔",
      "اوزار کبھی بھی پینلز یا ماؤنٹنگ اسٹرکچر پر نہ رکھیں۔",
    ],
  },
  {
    id: 12,
    title: "12. دستی ہینڈلنگ اور ایرگونومکس",
    points: [
      "ہوز، ٹینک یا آلات اٹھاتے وقت درست لفٹنگ تکنیک اپنائیں۔",
      "حد سے زیادہ جھکاؤ یا غیر محفوظ اسٹریچنگ سے گریز کریں۔",
    ],
  },
  {
    id: 13,
    title: "13. کیمیکل ہینڈلنگ (اگر لاگو ہو)",
    points: [
      "صرف منظور شدہ صفائی کے کیمیکلز استعمال کیے جائیں۔",
      "مینوفیکچرر کی حفاظتی ہدایات پر عمل کیا جائے۔",
      "کیمیکلز کو گرمی اور براہِ راست دھوپ سے دور محفوظ کریں۔",
    ],
  },
  {
    id: 14,
    title: "14. ہنگامی رپورٹنگ اور واقعہ انتظام",
    points: [
      "تمام حادثات، قریب الوقوع واقعات (Near Misses) اور غیر محفوظ حالات فوری طور پر سپروائزر کو رپورٹ کیے جائیں۔",
      "چوٹ، برقی جھٹکے یا گرنے کی صورت میں بلا تاخیر آپریشنز مینجمنٹ کو اطلاع دی جائے۔",
    ],
  },
  {
    id: 15,
    title: "15. غیر محفوظ حالات اور اسکیلَیشن",
    points: [
      "کسی بھی غیر محفوظ حالت کی صورت میں سپروائزر فوراً لائن مینیجر کو آگاہ کرے۔",
      "کام جاری رکھنا یا روکنا صرف لائن مینیجر کی ہدایات کے مطابق ہوگا۔",
    ],
  },
  {
    id: 16,
    title: "16. تربیت اور تعمیل کی توثیق",
    points: [
      "تعیناتی سے قبل تمام عملے کو سیفٹی بریفنگ دی جائے اور سیفٹی پروٹوکول دستاویز پر دستخط لیے جائیں۔",
      "وقتاً فوقتاً ریفریشر ٹریننگ اور ٹیسٹنگ کی جا سکتی ہے۔",
      "عدم تعمیل کی صورت میں معطلی یا سائٹ سے ہٹایا جا سکتا ہے۔",
    ],
  },
];

// 👇 ADDED: navigation prop to link with our Drawer
export default function CompliancePage({ navigation }: any) {
  const [playingId, setPlayingId] = useState<number | null>(null);

  const playVoice = (section: any) => {
    if (playingId === section.id) {
      Speech.stop();
      setPlayingId(null);
      return;
    }

    Speech.stop();
    setPlayingId(section.id);

    const textToSpeak = `${section.title}۔ ${section.points.join("۔ ")}`;

    Speech.speak(textToSpeak, {
      language: "ur-PK",
      rate: 0.85,
      pitch: 1.0,
      onDone: () =>
        setPlayingId((currentId) =>
          currentId === section.id ? null : currentId,
        ),
      onStopped: () =>
        setPlayingId((currentId) =>
          currentId === section.id ? null : currentId,
        ),
      onError: () =>
        setPlayingId((currentId) =>
          currentId === section.id ? null : currentId,
        ),
    });
  };

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  return (
    <LinearGradient colors={['#050B14', '#0B192C', '#050B14']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle="light-content" />

        {/* 👇 UPDATED: NOVAA Standard Header with Hamburger Menu */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => {
              Speech.stop(); // Stop speaking if they open the menu
              navigation.openDrawer();
            }} 
            style={styles.menuButton}
          >
            <Ionicons name="menu" size={28} color="#F59E0B" />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>COMPLIANCE</Text>
            <Text style={styles.headerSubtitle}>SAFETY PROTOCOLS</Text>
          </View>
          
          <View style={{ width: 44 }} /> 
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainTitleContainer}>
            <Text style={styles.mainTitleUrdu}>
              سولر پینلز کی صفائی کے لیے حفاظتی ہدایات
            </Text>
          </View>

          {complianceData.map((section) => (
            <View
              key={section.id}
              style={[
                styles.card,
                section.isWarning && styles.warningCard,
                playingId === section.id && styles.activeCard,
              ]}
            >
              <View style={styles.titleRow}>
                <TouchableOpacity
                  onPress={() => playVoice(section)}
                  style={styles.speakerBtn}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.speakerIconWrapper,
                      playingId === section.id && styles.speakerIconActive,
                    ]}
                  >
                    <Text style={styles.speakerIcon}>
                      {playingId === section.id ? "⏹️" : "🔊"}
                    </Text>
                  </View>
                </TouchableOpacity>

                <Text
                  style={[
                    styles.sectionTitle,
                    section.isWarning && styles.warningText,
                  ]}
                >
                  {section.title}
                </Text>
              </View>

              {section.points.map((point, index) => (
                <View key={index} style={styles.bulletRow}>
                  <Text style={styles.bulletText}>{point}</Text>
                  <View
                    style={[
                      styles.bulletPoint,
                      section.isWarning && styles.warningBullet,
                    ]}
                  />
                </View>
              ))}
            </View>
          ))}

          <View style={styles.footer}>
            <Text style={styles.footerText}>ملازم کی توثیق: (دستخط)</Text>
            <View style={styles.signatureLine} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 0,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(59, 130, 246, 0.2)',
  },
  menuButton: {
    padding: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  headerTextContainer: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: 2 },
  headerSubtitle: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 4, letterSpacing: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  mainTitleContainer: { marginBottom: 24, alignItems: "center" },
  mainTitleUrdu: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 34,
  },
  card: {
    backgroundColor: "rgba(30, 41, 59, 0.7)", // Semi-transparent to blend with gradient
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  warningCard: { borderLeftColor: "#EF4444", backgroundColor: "rgba(42, 22, 24, 0.8)" },
  activeCard: { borderColor: "#60A5FA", borderWidth: 1 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  speakerBtn: {
    marginRight: 10,
    marginTop: -2,
  },
  speakerIconWrapper: {
    backgroundColor: "#334155",
    padding: 8,
    borderRadius: 8,
  },
  speakerIconActive: {
    backgroundColor: "#EF4444", 
  },
  speakerIcon: {
    fontSize: 20,
  },
  sectionTitle: {
    color: "#3B82F6",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "right",
    flex: 1,
  },
  warningText: { color: "#EF4444" },
  bulletRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
    paddingLeft: 20,
  },
  bulletText: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 24,
    textAlign: "right",
    flex: 1,
    paddingRight: 10,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#94A3B8",
    marginTop: 8,
  },
  warningBullet: { backgroundColor: "#EF4444" },
  footer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "flex-end",
  },
  footerText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  signatureLine: {
    width: "60%",
    height: 1,
    backgroundColor: "#94A3B8",
    marginTop: 30,
  },
});