import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../constants/tokens';

interface ProfileHeaderProps {
    displayName?: string | null;
    email?: string | null;
    showBack?: boolean;
    onBackPress?: () => void;
    showMenu?: boolean;
    onMenuPress?: (anchor: { x: number; y: number }) => void;
    onAvatarPress?: () => void;
}

export default function ProfileHeader({ displayName, email, showBack, onBackPress, showMenu, onMenuPress, onAvatarPress }: ProfileHeaderProps) {
    const loaded = displayName !== null && displayName !== undefined;
    const name = displayName || 'Aero User';
    const emailProp = email || '';
    const initials = name.substring(0, 2).toUpperCase();

    const { height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const menuBtnRef = useRef<View>(null);
    const handleMenuPress = () => {
        menuBtnRef.current?.measureInWindow((x, y, width, height) => {
            onMenuPress?.({ x: x + width / 2, y: y + height / 2 });
        });
    };

    return (
        <View style={[styles.container, { height: screenHeight * 0.15, paddingTop: insets.top }]}>
            <LinearGradient
                colors={[tokens.colors.primaryDark, tokens.colors.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            />
            {showBack && (
                <Pressable onPress={onBackPress} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                    <Text style={styles.backText}>Back</Text>
                </Pressable>
            )}
            {showMenu && (
                <Pressable ref={menuBtnRef} onPress={handleMenuPress} style={styles.menuButton}>
                    <Ionicons name="ellipsis-horizontal" size={28} color="#fff" />
                </Pressable>
            )}
            <View style={styles.decorativeCircle1} pointerEvents="none" />
            <View style={styles.decorativeCircle2} pointerEvents="none" />
            <View style={styles.content} pointerEvents="box-none">
                <View style={styles.avatarContainer}>
                    <Pressable
                        onPress={onAvatarPress}
                        style={styles.avatarPressable}
                        accessibilityRole="button"
                        accessibilityLabel="Edit profile"
                    >
                        <Text style={styles.avatarText}>{initials}</Text>
                    </Pressable>
                </View>
                <View style={styles.infoContainer} pointerEvents="none">
                    <Text style={styles.brandText}>Aero Agent</Text>
                    <Text style={[styles.nameText, !loaded && { opacity: 0 }]} numberOfLines={1}>
                        {name}
                    </Text>
                    {!!emailProp && (
                        <Text style={styles.emailText} numberOfLines={1}>
                            {emailProp}
                        </Text>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: tokens.colors.primaryDark,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        paddingBottom: 20,
        position: 'relative',
    },
    backButton: {
        position: 'absolute',
        top: 50, // rough safe area adjustment, overriden by flex basically
        left: 20,
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
    },
    backText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 4,
    },
    menuButton: {
        position: 'absolute',
        top: 50, // rough safe area adjustment, overriden by flex basically
        right: 20,
        zIndex: 20,
        padding: 4,
        ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        zIndex: 10,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.4)',
        ...Platform.select({
            web: {
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
                elevation: 10,
            },
        }),
    },
    avatarPressable: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 40,
        ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
    },
    avatarText: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fff',
    },
    infoContainer: {
        marginLeft: 20,
        flex: 1,
    },
    brandText: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    nameText: {
        fontSize: 22,
        color: '#fff',
        fontWeight: '800',
        letterSpacing: -0.5,
        marginBottom: 2,
    },
    emailText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.9)',
        fontWeight: '500',
    },
    decorativeCircle1: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        top: -50,
        right: -50,
    },
    decorativeCircle2: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        bottom: -30,
        left: '20%',
    },
});
